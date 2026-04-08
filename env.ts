const readBool = (value?: string): boolean => value === 'true';

const rawDisableAuth = readBool(import.meta.env.VITE_DISABLE_AUTH);

if (import.meta.env.PROD && rawDisableAuth) {
  console.error(
    '[Bahati] VITE_DISABLE_AUTH=true is forbidden in production. Falling back to authenticated mode.',
  );
}

export const FRONTEND_ENV = {
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  vercelAnalyticsEnabled:
    import.meta.env.PROD &&
    readBool(import.meta.env.VITE_VERCEL_ANALYTICS_ENABLED),
  disableAuth: rawDisableAuth && !import.meta.env.PROD,
} as const;

export default FRONTEND_ENV;
