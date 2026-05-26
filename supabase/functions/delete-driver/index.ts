/// <reference path="../../../types/supabaseEdge.d.ts" />
// supabase/functions/delete-driver/index.ts
// Edge Function: POST /functions/v1/delete-driver
//
// Fully removes a driver account:
//   1. Looks up the auth_user_id from public.profiles via driver_id.
//   2. Deletes the Supabase Auth user (FIRST — irreversible; if this fails
//      the driver is still fully active and the admin can safely retry).
//   3. Calls delete_driver_cleanup_v1 RPC which atomically unlinks historical
//      records and removes the profiles + drivers rows in one transaction.
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

  // ── 4. Delete Supabase Auth user FIRST ───────────────────────────────────
  // Auth deletion precedes DB cleanup.  If it fails here the driver is still
  // fully active (auth + profile intact) and the admin can safely retry the
  // delete operation without any broken intermediate state.
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

  // ── 5. Atomically clean up all DB rows via RPC ───────────────────────────
  // delete_driver_cleanup_v1 unlinks historical records and removes the
  // profiles + drivers rows in a single PostgreSQL transaction.
  // Auth user is already gone at this point; if this RPC fails, DB rows are
  // orphaned (harmless — no one can log in as this driver) and the operator
  // can clean up with a manual SQL DELETE or by retrying this endpoint.
  const { error: cleanupError } = await supabaseAdmin
    .rpc('delete_driver_cleanup_v1', { p_driver_id: driverId });

  if (cleanupError) {
    console.error('DB cleanup RPC failed:', cleanupError.message);
    if (profileRow?.auth_user_id) {
      console.error(
        `MANUAL CLEANUP: auth user ${profileRow.auth_user_id} deleted but DB rows ` +
        `for driver ${driverId} remain — run: DELETE FROM drivers WHERE id = '${driverId}';`,
      );
    }
    return errorJson(
      'DB cleanup failed. Auth user deleted. Please retry or clean up manually.',
      500,
      'DB_CLEANUP_FAILED',
    );
  }

  return json({ success: true, driver_id: driverId });
});
