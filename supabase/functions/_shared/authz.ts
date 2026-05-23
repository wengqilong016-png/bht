// supabase/functions/_shared/authz.ts
// Authorization helpers for Supabase Edge Functions.
import { supabaseAdmin } from './supabaseAdmin.ts';

/**
 * Verify that the calling user is an admin by checking their JWT and then
 * looking up their role in public.profiles.
 *
 * @param authHeader - The raw "Authorization" header value (e.g. "Bearer <jwt>").
 * @returns The caller's auth_user_id if they are an admin, or null otherwise.
 */
export async function isAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;

  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;

  // Validate the JWT by fetching the user from Supabase Auth.
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) return null;

  // Check the caller's role in public.profiles.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .maybeSingle<{ role: string }>();

  // PGRST116 = no matching row — user has no profile (not an admin).  This is
  // a normal authorization result, not a server error.  Actual database errors
  // (connection failures, etc.) are logged and treated as denial for safety.
  if (profileError) {
    if (profileError.code !== 'PGRST116') {
      console.error('authz profile lookup failed:', profileError.message);
    }
    return null;
  }
  if (!profile || profile.role !== 'admin') return null;

  return user.id;
}
