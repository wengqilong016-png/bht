-- Migration: delete_driver_cleanup_v1
--
-- Atomically unlinks and removes all public DB rows for a deleted driver in a
-- single PostgreSQL transaction.  The caller (delete-driver Edge Function) is
-- responsible for deleting the Supabase Auth user BEFORE invoking this RPC.
--
-- Steps (all in one transaction):
--   1. Null-out driverId on transactions          (preserves financial history)
--   2. Null-out driverId on daily_settlements     (preserves settlement history)
--   3. Null-out assignedDriverId on locations     (unassigns machines)
--   4. Delete the profiles row                    (auth user already gone)
--   5. Delete the drivers row
--
-- SECURITY DEFINER so the service-role Edge Function can call this without
-- needing granular table-level grants beyond EXECUTE on the function.

CREATE OR REPLACE FUNCTION public.delete_driver_cleanup_v1(
  p_driver_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Preserve financial history by nulling the driver reference instead of
  -- cascading a delete.  ON DELETE SET NULL constraints would do this
  -- automatically on drivers DELETE, but explicit UPDATEs give us a clear
  -- audit trail and avoid relying on implicit cascade behaviour.
  UPDATE transactions
    SET "driverId" = NULL
    WHERE "driverId" = p_driver_id;

  UPDATE daily_settlements
    SET "driverId" = NULL
    WHERE "driverId" = p_driver_id;

  UPDATE locations
    SET "assignedDriverId" = NULL
    WHERE "assignedDriverId" = p_driver_id;

  -- Remove the profile row.  The auth user was already deleted by the caller,
  -- so the auth.users → profiles ON DELETE CASCADE would have fired already;
  -- this DELETE is a safety net for the case where auth_user_id was NULL.
  DELETE FROM profiles WHERE driver_id = p_driver_id;

  -- Remove the driver row last so FK constraints on the tables above remain
  -- intact throughout the transaction.
  DELETE FROM drivers WHERE id = p_driver_id;

  RETURN json_build_object('success', true, 'driver_id', p_driver_id);
END;
$$;

-- Only the service role (used by Edge Functions) may call this function.
REVOKE ALL ON FUNCTION public.delete_driver_cleanup_v1(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_driver_cleanup_v1(TEXT) TO service_role;
