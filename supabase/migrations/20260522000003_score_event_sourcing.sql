-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Score event sourcing — append-only event log + periodic snapshots
-- Date: 2026-05-22
-- ADR: ADR-003 — Hybrid: event log + periodic snapshot
--
-- Writes: trigger appends to score_events on every lastScore change.
--         Existing RPCs still update locations.lastScore directly (no change).
-- Snapshot: cron/caller invokes create_score_snapshot(location_id) periodically.
--           Snapshots are created when ≥50 events accumulated since last snapshot
--           AND ≥1 hour passed since last snapshot, otherwise it's a no-op.
-- Recovery: recover_last_score(location_id) → latest snapshot + replay events.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── score_events: append-only event log ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.score_events (
    id           UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    location_id  UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    old_score    BIGINT,
    new_score    BIGINT NOT NULL,
    source       TEXT NOT NULL DEFAULT 'update'
                 CHECK (source IN ('submit_collection_v2', 'approve_reset_request', 'update', 'recovery')),
    actor_id     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.score_events IS
  'Append-only event log recording every locations.lastScore change. Used for audit and state recovery.';

COMMENT ON COLUMN public.score_events.old_score IS
  'Previous lastScore value before this change. NULL for the first event.';

COMMENT ON COLUMN public.score_events.new_score IS
  'New lastScore value after this change.';

COMMENT ON COLUMN public.score_events.source IS
  'Which code path triggered the change: submit_collection_v2, approve_reset_request, update (trigger), or recovery.';

CREATE INDEX IF NOT EXISTS idx_score_events_location_created
  ON public.score_events (location_id, created_at DESC);

-- ── score_snapshots: periodic state snapshots ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.score_snapshots (
    id             UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    location_id    UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    score          BIGINT NOT NULL,
    last_event_id  UUID REFERENCES public.score_events(id) ON DELETE SET NULL,
    event_count    INTEGER NOT NULL DEFAULT 0,
    snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.score_snapshots IS
  'Periodic score snapshots to accelerate recovery. Created when ≥50 events accumulated AND ≥1 hour since last snapshot.';

COMMENT ON COLUMN public.score_snapshots.last_event_id IS
  'The last score_events row included in this snapshot. Events after this must be replayed.';

COMMENT ON COLUMN public.score_snapshots.event_count IS
  'Number of score_events rows this snapshot covers (informational).';

CREATE INDEX IF NOT EXISTS idx_score_snapshots_location_snapshot
  ON public.score_snapshots (location_id, snapshot_at DESC);

-- ── Trigger: record every lastScore change ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_score_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_source TEXT := 'update';
BEGIN
    -- Infer source from app context if available
    BEGIN
        v_source := COALESCE(
            NULLIF(current_setting('bht.score_source', true), ''),
            'update'
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_source := 'update';
    END;

    INSERT INTO public.score_events (
        location_id, old_score, new_score, source, actor_id
    ) VALUES (
        NEW.id,
        OLD."lastScore",
        NEW."lastScore",
        v_source,
        COALESCE(auth.uid()::text, 'anon')
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_score_event ON public.locations;
CREATE TRIGGER trg_score_event
    AFTER UPDATE OF "lastScore" ON public.locations
    FOR EACH ROW
    WHEN (NEW."lastScore" IS DISTINCT FROM OLD."lastScore")
    EXECUTE FUNCTION public.record_score_event();

-- ── create_score_snapshot: manual/cron-invoked snapshot ───────────────────────

CREATE OR REPLACE FUNCTION public.create_score_snapshot(
    p_location_id UUID
)
RETURNS JSON
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_last_snapshot   public.score_snapshots%ROWTYPE;
    v_last_event_id   UUID;
    v_event_count     INTEGER;
    v_current_score   BIGINT;
    v_min_gap         INTERVAL := '1 hour';
    v_min_events      INTEGER := 50;
    v_snapshot_id     UUID;
BEGIN
    -- Find the most recent snapshot for this location
    SELECT *
      INTO v_last_snapshot
      FROM public.score_snapshots
     WHERE location_id = p_location_id
     ORDER BY snapshot_at DESC
     LIMIT 1;

    -- Enforce minimum gap: must be ≥1 hour since last snapshot
    IF FOUND AND (NOW() - v_last_snapshot.snapshot_at) < v_min_gap THEN
        RETURN json_build_object(
            'skipped', true,
            'reason', 'minimum snapshot gap not met',
            'last_snapshot_at', v_last_snapshot.snapshot_at,
            'min_gap', v_min_gap::text
        );
    END IF;

    -- Count events since last snapshot (or from the beginning)
    IF FOUND THEN
        SELECT COUNT(*), MAX(e.id)
          INTO v_event_count, v_last_event_id
          FROM public.score_events e
         WHERE e.location_id = p_location_id
           AND e.created_at > v_last_snapshot.snapshot_at;
    ELSE
        SELECT COUNT(*), MAX(e.id)
          INTO v_event_count, v_last_event_id
          FROM public.score_events e
         WHERE e.location_id = p_location_id;
    END IF;

    -- Enforce minimum event count
    IF COALESCE(v_event_count, 0) < v_min_events THEN
        RETURN json_build_object(
            'skipped', true,
            'reason', 'not enough events since last snapshot',
            'event_count', COALESCE(v_event_count, 0),
            'min_events', v_min_events
        );
    END IF;

    -- Read current score
    SELECT "lastScore" INTO v_current_score
      FROM public.locations
     WHERE id = p_location_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    -- Create snapshot
    INSERT INTO public.score_snapshots (
        location_id, score, last_event_id, event_count, snapshot_at
    ) VALUES (
        p_location_id,
        COALESCE(v_current_score, 0),
        v_last_event_id,
        v_event_count,
        NOW()
    )
    RETURNING id INTO v_snapshot_id;

    RETURN json_build_object(
        'snapshot_id', v_snapshot_id,
        'location_id', p_location_id,
        'score', COALESCE(v_current_score, 0),
        'event_count', v_event_count,
        'snapshot_at', NOW()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_score_snapshot(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_score_snapshot(UUID) TO authenticated;

-- ── recover_last_score: recovery via snapshot + event replay ──────────────────

CREATE OR REPLACE FUNCTION public.recover_last_score(
    p_location_id UUID
)
RETURNS JSON
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_snapshot       public.score_snapshots%ROWTYPE;
    v_recovered      BIGINT;
    v_events_replayed INTEGER;
    v_source_events  INTEGER;
    v_total_events   INTEGER;
BEGIN
    -- Step 1: find latest snapshot
    SELECT *
      INTO v_snapshot
      FROM public.score_snapshots
     WHERE location_id = p_location_id
     ORDER BY snapshot_at DESC
     LIMIT 1;

    -- Step 2: replay events
    IF FOUND THEN
        -- Start from snapshot score, replay events after snapshot's last_event_id
        v_recovered := v_snapshot.score;

        WITH replayed AS (
            SELECT e.id, e.new_score, e.created_at
              FROM public.score_events e
             WHERE e.location_id = p_location_id
               AND e.created_at > v_snapshot.snapshot_at
             ORDER BY e.created_at ASC, e.id ASC
        )
        SELECT
            COALESCE(
                (SELECT replayed.new_score
                   FROM replayed
                  ORDER BY replayed.created_at DESC, replayed.id DESC
                  LIMIT 1
                ),
                v_recovered
            ),
            (SELECT COUNT(*) FROM replayed)
          INTO v_recovered, v_events_replayed;

        v_source_events := v_snapshot.event_count;
    ELSE
        -- No snapshot: replay ALL events
        WITH all_events AS (
            SELECT e.id, e.new_score, e.created_at
              FROM public.score_events e
             WHERE e.location_id = p_location_id
             ORDER BY e.created_at ASC, e.id ASC
        )
        SELECT
            COALESCE(
                (SELECT all_events.new_score
                   FROM all_events
                  ORDER BY all_events.created_at DESC, all_events.id DESC
                  LIMIT 1
                ),
                0
            ),
            (SELECT COUNT(*) FROM all_events)
          INTO v_recovered, v_events_replayed;

        v_source_events := 0;
    END IF;

    v_total_events := v_source_events + v_events_replayed;

    RETURN json_build_object(
        'location_id', p_location_id,
        'recovered_score', v_recovered,
        'snapshot_score', CASE WHEN v_snapshot.id IS NOT NULL THEN v_snapshot.score ELSE NULL END,
        'snapshot_id', v_snapshot.id,
        'snapshot_events', v_source_events,
        'events_replayed', v_events_replayed,
        'total_events', v_total_events,
        'method', CASE
            WHEN v_snapshot.id IS NOT NULL AND v_events_replayed > 0 THEN 'snapshot+replay'
            WHEN v_snapshot.id IS NOT NULL THEN 'snapshot_only'
            WHEN v_events_replayed > 0 THEN 'full_replay'
            ELSE 'no_data'
        END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recover_last_score(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recover_last_score(UUID) TO authenticated;

-- ── RLS: score_events ────────────────────────────────────────────────────────

ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS score_events_select ON public.score_events;
CREATE POLICY score_events_select ON public.score_events FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR location_id IN (
            SELECT id FROM public.locations
            WHERE "assignedDriverId" = public.get_my_driver_id()
        )
    );

-- ── RLS: score_snapshots ─────────────────────────────────────────────────────

ALTER TABLE public.score_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS score_snapshots_select ON public.score_snapshots;
CREATE POLICY score_snapshots_select ON public.score_snapshots FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR location_id IN (
            SELECT id FROM public.locations
            WHERE "assignedDriverId" = public.get_my_driver_id()
        )
    );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification:
--   1. Submit a collection → check score_events has new row
--   2. Call create_score_snapshot(location_id) → verify snapshot created
--   3. Call recover_last_score(location_id) → verify recovered score matches
--      locations.lastScore
--   4. Submit more collections → recover again → verify it replays new events
-- ═══════════════════════════════════════════════════════════════════════════════
