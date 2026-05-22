import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { enforceApiRateLimit, requireApiUser } from '../api/_lib/apiAuth';

class TestResponse {
  readonly body: string | null;
  readonly headers: Headers;
  readonly status: number;

  constructor(body: BodyInit | null = null, init?: ResponseInit) {
    this.body = typeof body === 'string' ? body : body === null ? null : String(body);
    this.headers = new Headers(init?.headers);
    this.status = init?.status ?? 200;
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  async json(): Promise<unknown> {
    return this.body ? JSON.parse(this.body) : null;
  }

  static json(data: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(data), init);
  }
}

if (typeof global.Response === 'undefined') {
  (global as any).Response = TestResponse;
}

function makeRequest(authorization?: string): Request {
  return {
    headers: new Headers(authorization ? { Authorization: authorization } : undefined),
  } as Request;
}

describe('api auth helper', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.resetAllMocks();
  });

  it('rejects requests without a bearer token', async () => {
    const result = await requireApiUser(makeRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns the authenticated user when the session and role are valid', async () => {
    (global.fetch as jest.Mock<typeof fetch>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'admin' }]), { status: 200 }));

    const result = await requireApiUser(
      makeRequest('Bearer token-1'),
      { roles: ['admin'] },
    );

    expect(result).toEqual({
      ok: true,
      user: { id: 'user-1', role: 'admin' },
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a valid user with an insufficient role', async () => {
    (global.fetch as jest.Mock<typeof fetch>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'driver' }]), { status: 200 }));

    const result = await requireApiUser(
      makeRequest('Bearer token-2'),
      { roles: ['admin'] },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rate-limits repeated calls for the same key', async () => {
    const key = `test-user-${Date.now()}`;

    expect(enforceApiRateLimit(key, { limit: 1, windowMs: 60_000 })).toBeNull();
    const limited = enforceApiRateLimit(key, { limit: 1, windowMs: 60_000 });

    expect(limited?.status).toBe(429);
    await expect(limited?.json()).resolves.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});
