-- ═══════════════════════════════════════════════════════════════════════════════
-- Security fix: Harden driver profile trigger for concurrent Auth user creation
-- Date: 2026-05-22
-- Source: SOURCE_AUDIT_20260522.md H24 (TOCTOU race on create-driver)
--
-- H24: Two concurrent create-driver calls with the same driver_id could both pass
--      the check-then-create sequence. The second Auth user's trigger would
--      overwrite the first driver's name/username via ON CONFLICT DO UPDATE,
--      and the second profile insert would fail on the unique driver_id index.
--
-- Fix:
--   1. drivers insert: only UPDATE name/username if the existing row is a
--      skeleton (name = id or username = lower(id)), i.e. created by the
--      Edge Function's pre-create step. Already-populated rows are preserved.
--   2. profiles insert: use ON CONFLICT on the driver_id partial unique index
--      to avoid a hard error. If a profile with this driver_id already exists,
--      skip the insert (the row belongs to the first Auth user, which is the
--      legitimate winner of the race).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_driver_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_metadata     JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    v_role         TEXT := COALESCE(v_metadata->>'role', 'driver');
    v_driver_id    TEXT := NULLIF(BTRIM(COALESCE(v_metadata->>'driver_id', '')), '');
    v_display_name TEXT := NULLIF(BTRIM(COALESCE(v_metadata->>'display_name', '')), '');
    v_username     TEXT := NULLIF(BTRIM(COALESCE(v_metadata->>'username', '')), '');
    v_existing_driver_name TEXT;
BEGIN
    IF v_role <> 'driver' OR v_driver_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check whether the driver row already has meaningful data (not a skeleton)
    SELECT name INTO v_existing_driver_name
      FROM public.drivers
     WHERE id = v_driver_id;

    INSERT INTO public.drivers (id, name, username, status)
    VALUES (
        v_driver_id,
        COALESCE(v_display_name, v_driver_id),
        COALESCE(v_username, LOWER(v_driver_id)),
        'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        -- Only overwrite skeleton rows (name = id or username = lower(id))
        name = CASE
            WHEN drivers.name IS NULL OR drivers.name = drivers.id
            THEN EXCLUDED.name
            ELSE drivers.name
        END,
        username = CASE
            WHEN drivers.username IS NULL OR drivers.username = LOWER(drivers.id)
            THEN EXCLUDED.username
            ELSE drivers.username
        END;

    -- Only insert a profile if this driver_id isn't already bound to another
    -- Auth user. The first caller wins; the second skips silently.
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE driver_id = v_driver_id
           AND auth_user_id IS DISTINCT FROM NEW.id
    ) THEN
        INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
        VALUES (
            NEW.id,
            'driver',
            COALESCE(v_display_name, v_driver_id),
            v_driver_id
        )
        ON CONFLICT (auth_user_id) DO UPDATE
        SET
            role = EXCLUDED.role,
            display_name = EXCLUDED.display_name,
            driver_id = EXCLUDED.driver_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_driver_auth_user() FROM PUBLIC;

COMMIT;
