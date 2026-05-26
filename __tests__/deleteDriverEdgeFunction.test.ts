import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

type ProfileLookupResult = {
  data: { auth_user_id: string | null } | null;
  error: { message: string } | null;
};
type DeleteUserResult = { error: { message: string; status?: number } | null };
type RpcResult = { data: unknown; error: { message: string } | null };

type ProfilesTableStub = {
  select: () => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<ProfileLookupResult>;
    };
  };
};

type MutableEdgeGlobals = {
  Deno?: {
    env: {
      get(name: string): string | undefined;
    };
    serve: typeof mockServe;
  };
  Response?: typeof Response;
};

const mockIsAdmin = jest.fn<() => Promise<string | null>>();
const mockDeleteUser = jest.fn<(userId: string) => Promise<DeleteUserResult>>();
const mockProfileMaybeSingle = jest.fn<() => Promise<ProfileLookupResult>>();
const mockRpc = jest.fn<(fn: string, params: Record<string, unknown>) => Promise<RpcResult>>();
const mockFrom = jest.fn<(table: string) => ProfilesTableStub>();
const mockServe = jest.fn<(handler: (req: Request) => Promise<Response>) => void>();
const originalResponse = globalThis.Response;

jest.mock('../supabase/functions/_shared/authz.ts', () => ({
  isAdmin: () => mockIsAdmin(),
}));

jest.mock('../supabase/functions/_shared/supabaseAdmin.ts', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: (userId: string) => mockDeleteUser(userId),
      },
    },
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: Record<string, unknown>) => mockRpc(fn, params),
  },
}));

async function loadDeleteDriverHandler() {
  jest.resetModules();
  mockServe.mockClear();

  const edgeGlobals = globalThis as unknown as MutableEdgeGlobals;

  class MockResponse {
    status: number;
    headers: Record<string, string>;
    private bodyText: string;

    constructor(body: string | null, init?: { status?: number; headers?: Record<string, string> }) {
      this.bodyText = body ?? '';
      this.status = init?.status ?? 200;
      this.headers = init?.headers ?? {};
    }

    async json() {
      return JSON.parse(this.bodyText);
    }
  }

  edgeGlobals.Deno = {
    env: {
      get: () => undefined,
    },
    serve: mockServe,
  };
  edgeGlobals.Response = MockResponse as unknown as typeof Response;

  await import('../supabase/functions/delete-driver/index.ts');

  const handler = mockServe.mock.calls[0]?.[0];
  if (!handler) {
    throw new Error('delete-driver did not register a Deno.serve handler');
  }
  return handler as (req: Request) => Promise<Response>;
}

function makeRequest(body: Record<string, unknown>, method = 'POST') {
  return {
    method,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'authorization') return 'Bearer token';
        if (name.toLowerCase() === 'content-type') return 'application/json';
        return null;
      },
    },
    json: async () => body,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAdmin.mockResolvedValue('admin-1');
  mockDeleteUser.mockResolvedValue({ error: null });
  mockProfileMaybeSingle.mockResolvedValue({ data: { auth_user_id: 'auth-1' }, error: null });
  mockRpc.mockResolvedValue({ data: { success: true }, error: null });
  mockFrom.mockImplementation((_table: string) => ({
    select: () => ({
      eq: (_column: string, _value: string) => ({
        maybeSingle: () => mockProfileMaybeSingle(),
      }),
    }),
  }));
});

afterEach(() => {
  const edgeGlobals = globalThis as unknown as MutableEdgeGlobals;

  delete edgeGlobals.Deno;
  if (originalResponse) {
    edgeGlobals.Response = originalResponse;
  } else {
    delete edgeGlobals.Response;
  }
});

describe('delete-driver edge function', () => {
  it('looks up auth_user_id, deletes auth user, then calls cleanup RPC', async () => {
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, driver_id: 'drv-1' });

    // Profile lookup must happen first (to obtain auth_user_id)
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockProfileMaybeSingle).toHaveBeenCalledTimes(1);

    // Auth user must be deleted BEFORE the cleanup RPC
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1');

    // Cleanup RPC must be called with correct driver_id
    expect(mockRpc).toHaveBeenCalledWith('delete_driver_cleanup_v1', { p_driver_id: 'drv-1' });

    // Auth deletion must precede RPC: verify call order via mock.invocationCallOrder
    const deleteUserOrder = mockDeleteUser.mock.invocationCallOrder[0]!;
    const rpcOrder = mockRpc.mock.invocationCallOrder[0]!;
    expect(deleteUserOrder).toBeLessThan(rpcOrder);
  });

  it('skips auth deletion when the profile row has no linked auth user', async () => {
    mockProfileMaybeSingle.mockResolvedValueOnce({ data: { auth_user_id: null }, error: null });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-2' }));

    expect(response.status).toBe(200);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('delete_driver_cleanup_v1', { p_driver_id: 'drv-2' });
  });

  it('returns AUTH_DELETE_FAILED and does not call cleanup RPC when auth deletion fails', async () => {
    mockDeleteUser.mockResolvedValueOnce({ error: { message: 'auth service unavailable' } });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-3' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Auth account deletion failed — driver is still active. Please retry.',
      code: 'AUTH_DELETE_FAILED',
    });
    // RPC must NOT be called — driver DB rows should remain intact so the
    // driver can still log in and the admin can safely retry the delete.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('treats 404 auth-user-not-found as success and proceeds with cleanup', async () => {
    mockDeleteUser.mockResolvedValueOnce({ error: { message: 'User not found', status: 404 } });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-5' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, driver_id: 'drv-5' });
    expect(mockRpc).toHaveBeenCalledWith('delete_driver_cleanup_v1', { p_driver_id: 'drv-5' });
  });

  it('returns DB_CLEANUP_FAILED when the cleanup RPC fails after auth deletion', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'relation does not exist' } });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-4' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'DB cleanup failed. Auth user deleted. Please retry or clean up manually.',
      code: 'DB_CLEANUP_FAILED',
    });
    // Auth user was already deleted before the RPC was called
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1');
  });
});
