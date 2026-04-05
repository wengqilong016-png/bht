ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS last_relocated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.touch_location_relocation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.area IS DISTINCT FROM OLD.area
        OR NEW.coords IS DISTINCT FROM OLD.coords
    ) THEN
        NEW.last_relocated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_location_relocation_timestamp ON public.locations;
CREATE TRIGGER trg_touch_location_relocation_timestamp
    BEFORE UPDATE ON public.locations
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_location_relocation_timestamp();
