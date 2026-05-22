-- Limit driver-role updates on assigned locations to the fields used by the
-- driver site-info workflow. Admin users keep the existing RLS ability to
-- update full location records.

CREATE OR REPLACE FUNCTION public.enforce_driver_location_update_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(public.get_my_role(), '') <> 'driver' THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.name IS DISTINCT FROM OLD.name
        OR NEW.area IS DISTINCT FROM OLD.area
        OR NEW."machineId" IS DISTINCT FROM OLD."machineId"
        OR NEW."commissionRate" IS DISTINCT FROM OLD."commissionRate"
        OR NEW."lastScore" IS DISTINCT FROM OLD."lastScore"
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.coords IS DISTINCT FROM OLD.coords
        OR NEW."assignedDriverId" IS DISTINCT FROM OLD."assignedDriverId"
        OR NEW."machinePhotoUrl" IS DISTINCT FROM OLD."machinePhotoUrl"
        OR NEW."initialStartupDebt" IS DISTINCT FROM OLD."initialStartupDebt"
        OR NEW."remainingStartupDebt" IS DISTINCT FROM OLD."remainingStartupDebt"
        OR NEW."isNewOffice" IS DISTINCT FROM OLD."isNewOffice"
        OR NEW."lastRevenueDate" IS DISTINCT FROM OLD."lastRevenueDate"
        OR NEW."resetLocked" IS DISTINCT FROM OLD."resetLocked"
        OR NEW."dividendBalance" IS DISTINCT FROM OLD."dividendBalance"
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.last_relocated_at IS DISTINCT FROM OLD.last_relocated_at
    THEN
        RAISE EXCEPTION 'Drivers may only update owner contact fields on assigned locations'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_driver_location_update_fields ON public.locations;
CREATE TRIGGER trg_enforce_driver_location_update_fields
    BEFORE UPDATE ON public.locations
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_driver_location_update_fields();
