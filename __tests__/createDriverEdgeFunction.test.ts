import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

type MutationResult = { error: { message: string } | null };
type MaybeSingleResult<T> = { data: T | null; error: { message: string } | null };
type CreateUserResult = { data: { user: { id: string } | null }; error: { message: string; code?: string } | null };
type DeleteUserResult = { error: { message: string } | null };

type MutableEdgeGlobals = {
  Deno?: {
    serve: typeof mockServe;
  };
  Response?: typeof Response;
};

const mockIsAdmin = jest.fn<() => Promise<string | null>>();
const mockCreateUser = jest.fn<() => Promise<CreateUserResult>>();
const mockDeleteUser = jest.fn<(userId: string) => Promise<DeleteUserResult>>();
const mockProfileMaybeSingle = jest.fn<() => Promise<MaybeSingleResult<{ auth_user_id: string; driver_id: string }>>>();
const mockDriverMaybeSingle = jest.fn<() => Promise<MaybeSingleResult<{ id: string; name?: string; username?: string }>>>();
const mockDriverUpdateEq = jest.fn<(column: string, value: string) => Promise<MutationResult>>();
const mockDriverDeleteEq = jest.fn<(column: string, value: string) => Promise<MutationResult>>();
const mockFrom = jest.fn<(table: string) => unknown>();
const mockServe = jest.fn<(handler: (req: Request) => Promise<Response>) => void>();
const originalResponse = globalThis.Response;

jest.mock('../supabase/functions/_shared/authz.ts', () => ({
  isAdmin: () => mockIsAdmin(),
}));

jest.mock('../supabase/functions/_shared/supabaseAdmin.ts', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: () => mockCreateUser(),
        deleteUser: (userId: string) => mockDeleteUser(userId),
      },
    },
    from: (table: string) => mockFrom(table),
  },
}));

async function loadCreateDriverHandler() {
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
    serve: mockServe,
  };
  edgeGlobals.Response = MockResponse as unknown as typeof Response;

  await import('../supabase/functions/create-driver/index.ts');

  const handler = mockServe.mock.calls[0]?.[0];
  if (!handler) {
    throw new Error('create-driver did not register a Deno.serve handler');
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

function makeSupabaseTableStub(table: string) {
  if (table === 'profiles') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockProfileMaybeSingle(),
        }),
      }),
    };
  }

  if (table === 'drivers') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockDriverMaybeSingle(),
        }),
      }),
      update: () => ({
        eq: (column: string, value: string) => mockDriverUpdateEq(column, value),
      }),
      delete: () => ({
        eq: (column: string, value: string) => mockDriverDeleteEq(column, value),
      }),
    };
  }

  throw new Error(`Unexpected table access: ${table}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAdmin.mockResolvedValue('admin-1');
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
  mockDeleteUser.mockResolvedValue({ error: null });
  mockProfileMaybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValue({ data: { auth_user_id: 'auth-1', driver_id: 'drv-1' }, error: null });
  mockDriverMaybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValue({ data: { id: 'drv-1' }, error: null });
  mockDriverUpdateEq.mockResolvedValue({ error: null });
  mockDriverDeleteEq.mockResolvedValue({ error: null });
  mockFrom.mockImplementation((table: string) => makeSupabaseTableStub(table));
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

describe('create-driver edge function', () => {
  it('removes the trigger-created driver row when post-create business persistence fails', async () => {
    mockDriverUpdateEq.mockResolvedValueOnce({ error: { message: 'drivers locked' } });
    const handler = await loadCreateDriverHandler();

    const response = await handler(makeRequest({
      email: 'driver@example.com',
      password: 'secret-password',
      driver_id: 'drv-1',
      display_name: 'Driver One',
      username: 'drv-1',
      business_fields: { phone: '255700000001' },
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'drivers business update failed: drivers locked',
    });
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1');
    expect(mockDriverDeleteEq).toHaveBeenCalledWith('id', 'drv-1');
  });
});
