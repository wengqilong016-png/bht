/**
 * __tests__/localDB.test.ts
 *
 * Tests for services/localDB.ts
 *
 * idb-keyval is mocked so tests run in jsdom without a real IndexedDB
 * implementation.  Each test exercises the IDB-success path, the IDB-failure /
 * localStorage-fallback path, and the double-failure guard.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── idb-keyval mock ──────────────────────────────────────────────────────────
const mockIdbGet = jest.fn<(key: string) => Promise<unknown>>();
const mockIdbSet = jest.fn<(key: string, value: unknown) => Promise<void>>();
const mockIdbDel = jest.fn<(key: string) => Promise<void>>();

jest.mock('idb-keyval', () => ({
  get: (key: string) => mockIdbGet(key),
  set: (key: string, value: unknown) => mockIdbSet(key, value),
  del: (key: string) => mockIdbDel(key),
}));

import { localDB } from '../services/localDB';

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

// ══ localDB.get ═══════════════════════════════════════════════════════════════

describe('localDB.get()', () => {
  it('returns the value from IDB when available', async () => {
    mockIdbGet.mockResolvedValue({ hello: 'world' });

    const result = await localDB.get<{ hello: string }>('my-key');
    expect(result).toEqual({ hello: 'world' });
  });

  it('returns null when IDB returns undefined', async () => {
    mockIdbGet.mockResolvedValue(undefined);

    const result = await localDB.get('missing-key');
    expect(result).toBeNull();
  });

  it('falls back to localStorage when IDB throws', async () => {
    mockIdbGet.mockRejectedValue(new Error('IDB unavailable'));
    localStorage.setItem('fallback-key', JSON.stringify({ val: 42 }));

    const result = await localDB.get<{ val: number }>('fallback-key');
    expect(result).toEqual({ val: 42 });
  });

  it('returns null when both IDB and localStorage have no value', async () => {
    mockIdbGet.mockRejectedValue(new Error('IDB unavailable'));

    const result = await localDB.get('non-existent');
    expect(result).toBeNull();
  });

  it('returns null when localStorage value is invalid JSON', async () => {
    mockIdbGet.mockRejectedValue(new Error('IDB unavailable'));
    localStorage.setItem('bad-json', '{ not valid json');

    const result = await localDB.get('bad-json');
    expect(result).toBeNull();
  });
});

// ══ localDB.set ═══════════════════════════════════════════════════════════════

describe('localDB.set()', () => {
  it('writes to IDB on success', async () => {
    mockIdbSet.mockResolvedValue(undefined);

    await localDB.set('my-key', { data: 1 });
    expect(mockIdbSet).toHaveBeenCalledWith('my-key', { data: 1 });
  });

  it('falls back to localStorage when IDB throws', async () => {
    mockIdbSet.mockRejectedValue(new Error('IDB write error'));

    await localDB.set('fallback-key', { data: 99 });

    expect(localStorage.getItem('fallback-key')).toBe(JSON.stringify({ data: 99 }));
  });

  it('does not throw when both IDB and localStorage fail', async () => {
    mockIdbSet.mockRejectedValue(new Error('IDB write error'));
    // Make localStorage.setItem throw
    const originalSetItem = localStorage.setItem.bind(localStorage);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage quota exceeded');
    });

    await expect(localDB.set('key', { x: 1 })).resolves.toBeUndefined();

    jest.spyOn(Storage.prototype, 'setItem').mockRestore();
    // Restore
    Storage.prototype.setItem = originalSetItem;
  });
});

// ══ localDB.clear ═════════════════════════════════════════════════════════════

describe('localDB.clear()', () => {
  it('deletes from IDB on success', async () => {
    mockIdbDel.mockResolvedValue(undefined);

    await localDB.clear('my-key');
    expect(mockIdbDel).toHaveBeenCalledWith('my-key');
  });

  it('falls back to localStorage.removeItem when IDB throws', async () => {
    mockIdbDel.mockRejectedValue(new Error('IDB delete error'));
    localStorage.setItem('remove-me', 'value');

    await localDB.clear('remove-me');

    expect(localStorage.getItem('remove-me')).toBeNull();
  });
});
