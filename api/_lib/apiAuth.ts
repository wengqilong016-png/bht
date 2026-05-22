export type ApiUserRole = 'admin' | 'driver';

export interface AuthenticatedApiUser {
  id: string;
  role: ApiUserRole;
}

type RequireApiUserResult =
  | { ok: true; user: AuthenticatedApiUser }
  | { ok: false; response: Response };

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_BUCKETS_KEY = '__bhtApiRateLimitBuckets';

function jsonAuthError(status: number, error: string, code: string): Response {
  return Response.json(
    { error, code },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function readServerEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value?.trim()) {
      return value.trim();
    }
  }
  return '';
}

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = readServerEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = readServerEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  return url && anonKey ? { url, anonKey } : null;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

async function fetchSupabaseJson<T>(
  url: string,
  anonKey: string,
  token: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  return { ok: true, data: (await response.json()) as T };
}

export async function requireApiUser(
  request: Request,
  options: { roles?: ApiUserRole[] } = {},
): Promise<RequireApiUserResult> {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, response: jsonAuthError(401, 'Authentication required', 'UNAUTHORIZED') };
  }

  const config = getSupabaseConfig();
  if (!config) {
    return { ok: false, response: jsonAuthError(503, 'Supabase auth is not configured', 'AUTH_NOT_CONFIGURED') };
  }

  const userUrl = new URL('/auth/v1/user', config.url);
  const userResult = await fetchSupabaseJson<{ id?: string }>(
    userUrl.toString(),
    config.anonKey,
    token,
  );
  if (!userResult.ok || !userResult.data.id) {
    return { ok: false, response: jsonAuthError(401, 'Invalid or expired session', 'UNAUTHORIZED') };
  }

  const profileUrl = new URL('/rest/v1/profiles', config.url);
  profileUrl.searchParams.set('select', 'role');
  profileUrl.searchParams.set('auth_user_id', `eq.${userResult.data.id}`);
  profileUrl.searchParams.set('limit', '1');

  const profileResult = await fetchSupabaseJson<Array<{ role?: string }>>(
    profileUrl.toString(),
    config.anonKey,
    token,
  );
  if (!profileResult.ok) {
    return { ok: false, response: jsonAuthError(403, 'Profile lookup failed', 'FORBIDDEN') };
  }

  const role = profileResult.data[0]?.role;
  if (role !== 'admin' && role !== 'driver') {
    return { ok: false, response: jsonAuthError(403, 'Valid user profile required', 'FORBIDDEN') };
  }

  if (options.roles?.length && !options.roles.includes(role)) {
    return { ok: false, response: jsonAuthError(403, 'Insufficient role', 'FORBIDDEN') };
  }

  return {
    ok: true,
    user: {
      id: userResult.data.id,
      role,
    },
  };
}

export function enforceApiRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): Response | null {
  const globalState = globalThis as typeof globalThis & {
    [RATE_LIMIT_BUCKETS_KEY]?: Map<string, RateLimitBucket>;
  };
  const buckets = globalState[RATE_LIMIT_BUCKETS_KEY] ?? new Map<string, RateLimitBucket>();
  globalState[RATE_LIMIT_BUCKETS_KEY] = buckets;

  const now = Date.now();
  const current = buckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + options.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= options.limit) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return Response.json(
    { error: 'Too many requests', code: 'RATE_LIMITED' },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}
