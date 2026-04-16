-- Lightweight driver workflow diagnostics.
-- Stores only flow metadata: no photos, precise GPS coordinates, or phone numbers.

CREATE TABLE IF NOT EXISTS public.driver_flow_events (
    id UUID PRIMARY KEY,
    driver_id TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    draft_tx_id TEXT,
    location_id TEXT,
    step TEXT NOT NULL,
    event_name TEXT NOT NULL,
    online_status BOOLEAN NOT NULL DEFAULT FALSE,
    gps_permission TEXT NOT NULL DEFAULT 'unknown',
    has_photo BOOLEAN NOT NULL DEFAULT FALSE,
    error_category TEXT,
    duration_ms INTEGER,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT driver_flow_events_step_check CHECK (
        step IN (
            'selection',
            'capture',
            'amounts',
            'confirm',
            'complete',
            'reset_request',
            'payout_request',
            'office_loan',
            'site_info'
        )
    ),
    CONSTRAINT driver_flow_events_gps_permission_check CHECK (
        gps_permission IN ('prompt', 'granted', 'denied', 'timeout', 'error', 'unknown')
    )
);

CREATE INDEX IF NOT EXISTS idx_driver_flow_events_created
    ON public.driver_flow_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_flow_events_driver_created
    ON public.driver_flow_events (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_flow_events_flow
    ON public.driver_flow_events (flow_id, created_at);

CREATE INDEX IF NOT EXISTS idx_driver_flow_events_step_event
    ON public.driver_flow_events (step, event_name, created_at DESC);

ALTER TABLE public.driver_flow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_flow_events_admin_select ON public.driver_flow_events;
CREATE POLICY driver_flow_events_admin_select ON public.driver_flow_events
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS driver_flow_events_driver_insert ON public.driver_flow_events;
CREATE POLICY driver_flow_events_driver_insert ON public.driver_flow_events
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR driver_id = public.get_my_driver_id()
    );

DROP POLICY IF EXISTS driver_flow_events_no_update ON public.driver_flow_events;
DROP POLICY IF EXISTS driver_flow_events_no_delete ON public.driver_flow_events;
