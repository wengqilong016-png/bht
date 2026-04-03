/**
 * Authentication mode helpers.
 * Use isAuthDisabled() to check whether the app is running in local/offline
 * mode (VITE_DISABLE_AUTH=true), which bypasses Supabase Auth entirely.
 */

export function isAuthDisabled(): boolean {
  return import.meta.env.VITE_DISABLE_AUTH === 'true';
}
