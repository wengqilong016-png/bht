/// <reference path="../../../types/supabaseEdge.d.ts" />
// supabase/functions/delete-driver/index.ts
// Edge Function: POST /functions/v1/delete-driver
//
// Fully removes a driver account:
//   1. Looks up the auth_user_id from public.profiles via driver_id.
//   2. Deletes the Supabase Auth user.
//   3. Unlinks historical/assigned records that must outlive the driver.
//   4. Deletes any remaining public.profiles row and the public.drivers row.
//
// Security: only callers whose public.profiles.role = 'admin' may invoke this
// endpoint.  The service_role key is used so RLS policies do not block writes.
//
// Request body (JSON):
//   driver_id   string  required — UUID of the driver to delete
//
// Response body (JSON):
//   success: true  → { success, driver_id }
//   success: false → { success, error, code? }

import { isAdmin } from '../_shared/authz.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorJson(error: string, status: number, code: string): Response {
  return json({ success: false, error, code }, status);
}

async function unlinkDriverReferences(driverId: string): Promise<{ error: string; code: string } | null> {
  const { error: transactionUnlinkError } = await supabaseAdmin
    .from('transactions')
    .update({ driverId: null })
    .eq('driverId', driverId);

  if (transactionUnlinkError) {
    console.error('transaction unlink failed:', transactionUnlinkError.message);
    return { error: 'Internal server error', code: 'TRANSACTION_UNLINK_FAILED' };
  }

  const { error: settlementUnlinkError } = await supabaseAdmin
    .from('daily_settlements')
    .update({ driverId: null })
    .eq('driverId', driverId);

  if (settlementUnlinkError) {
    console.error('settlement unlink failed:', settlementUnlinkError.message);
    return { error: 'Internal server error', code: 'SETTLEMENT_UNLINK_FAILED' };
  }

  const { error: locationUnlinkError } = await supabaseAdmin
    .from('locations')
    .update({ assignedDriverId: null })
    .eq('assignedDriverId', driverId);

  if (locationUnlinkError) {
    console.error('location unlink failed:', locationUnlinkError.message);
    return { error: 'Internal server error', code: 'LOCATION_UNLINK_FAILED' };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  // ── 1. Authorization ─────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  const callerId = await isAdmin(authHeader);
  if (!callerId) {
    return errorJson('Forbidden: admin access required', 403, 'FORBIDDEN');
  }

  // ── 2. Parse & validate request body ────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const driverId = typeof body.driver_id === 'string' ? body.driver_id.trim() : '';
  if (!driverId) {
    return errorJson('driver_id is required', 400, 'MISSING_DRIVER_ID');
  }

  // ── 3. Look up auth_user_id from profiles via driver_id ──────────────────
  const { data: profileRow, error: driverLookupError } = await supabaseAdmin
    .from('profiles')
    .select('auth_user_id')
    .eq('driver_id', driverId)
    .maybeSingle<{ auth_user_id: string | null }>();

  if (driverLookupError) {
    console.error('driver lookup failed:', driverLookupError.message);
    return errorJson('Internal server error', 500, 'DRIVER_LOOKUP_FAILED');
  }

  // ── 4. Unlink historical references (safe to repeat; preserves audit trail) ──
  // Transactions and daily_settlements preserve historical financial records.
  // Locations also need explicit unassignment so the UI does not show stale
  // driver ownership after the account is gone.
  const unlinkError = await unlinkDriverReferences(driverId);
  if (unlinkError) {
    return errorJson(unlinkError.error, 500, unlinkError.code);
  }

  // ── 5. Delete Supabase Auth user BEFORE DB rows ───────────────────────────
  // Auth deletion must precede profile/driver row deletion.  If auth deletion
  // fails here, the driver still has a valid profile and can continue working —
  // the admin can simply retry the delete operation.  If we removed DB rows
  // first and auth deletion then failed, the driver would be able to
  // authenticate but receive "profile not found" on every subsequent request,
  // which is a confusing broken state requiring manual SQL repair.
  if (profileRow?.auth_user_id) {
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      profileRow.auth_user_id,
    );
    if (authDeleteError) {
      console.error('auth user delete failed:', authDeleteError.message);
      return errorJson(
        'Auth account deletion failed — driver is still active. Please retry.',
        500,
        'AUTH_DELETE_FAILED',
      );
    }
  }

  // ── 6. Remove profile and driver rows ────────────────────────────────────
  // Auth user is already gone at this point.  If either delete fails below,
  // the rows are orphaned (no one can authenticate as this driver any more)
  // and can be cleaned up with a targeted SQL DELETE.
  const { error: profileDeleteError } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('driver_id', driverId);

  if (profileDeleteError) {
    console.error('profile delete failed:', profileDeleteError.message);
    console.error(
      `MANUAL CLEANUP: auth user ${profileRow?.auth_user_id} deleted but ` +
      `profiles row for driver ${driverId} remains — remove via SQL.`,
    );
    return errorJson('Internal server error', 500, 'PROFILE_DELETE_FAILED');
  }

  const { error: driverDeleteError } = await supabaseAdmin
    .from('drivers')
    .delete()
    .eq('id', driverId);

  if (driverDeleteError) {
    console.error('driver delete failed:', driverDeleteError.message);
    console.error(
      `MANUAL CLEANUP: auth user + profile deleted for driver ${driverId} ` +
      `but drivers row remains — remove via SQL.`,
    );
    return errorJson('Internal server error', 500, 'DRIVER_DELETE_FAILED');
  }

  return json({ success: true, driver_id: driverId });
});
