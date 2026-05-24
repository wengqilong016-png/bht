/**
 * __tests__/auditConsumer.test.ts
 *
 * Tests for the async transaction audit consumer (ADR-002).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import type { Transaction } from '../types/models';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabase = {
  from: jest.fn(),
};

jest.mock('../supabaseClient', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

const mockOn = jest.fn();

jest.mock('../utils/eventBus', () => ({
  eventBus: {
    emit: jest.fn(),
    on: mockOn,
    off: jest.fn(),
    clear: jest.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'TX-test-001',
    timestamp: new Date().toISOString(),
    locationId: 'loc-1',
    locationName: 'Shop One',
    driverId: 'drv-1',
    driverName: 'Driver One',
    previousScore: 100,
    currentScore: 200,
    revenue: 10000,
    commission: 1500,
    ownerRetention: 0,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 8500,
    gps: { lat: -6.8, lng: 39.3 },
    dataUsageKB: 100,
    type: 'collection',
    approvalStatus: 'approved',
    auditStatus: 'pending',
    isSynced: false,
    ...overrides,
  } as Transaction;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuditConsumer', () => {
  let capturedHandler: ((tx: Transaction) => void | Promise<void>) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedHandler = null;
    mockOn.mockImplementation((_event: string, handler: unknown) => {
      capturedHandler = handler as (tx: Transaction) => void;
      return jest.fn();
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('semantic validation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('passes a valid collection transaction', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
        maybeSingle: jest.fn().mockResolvedValue({ data: [], error: null }),
      } as unknown as Record<string, jest.Mock>);

      const { startAuditConsumer } = await import('../utils/auditConsumer');
      startAuditConsumer();

      const tx = makeMockTx();
      await capturedHandler!(tx);
      await jest.runAllTimersAsync();

      expect(mockSupabase.from).toHaveBeenCalledWith('transaction_audit_log');
    });

    it('inserts audit log even for failing transactions', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
        maybeSingle: jest.fn().mockResolvedValue({ data: [], error: null }),
      } as unknown as Record<string, jest.Mock>);

      const { startAuditConsumer } = await import('../utils/auditConsumer');
      startAuditConsumer();

      const tx = makeMockTx({ revenue: -500 });
      await capturedHandler!(tx);
      await jest.runAllTimersAsync();

      expect(mockSupabase.from).toHaveBeenCalledWith('transaction_audit_log');
    });
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const { withRetry } = await import('../utils/auditConsumer');
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('ok');
      const result = await withRetry(fn, 1);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds', async () => {
      const { withRetry } = await import('../utils/auditConsumer');
      const fn = jest.fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('ok');
      const result = await withRetry(fn, 3);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting all retries', async () => {
      const { withRetry } = await import('../utils/auditConsumer');
      const fn = jest.fn<() => Promise<string>>()
        .mockRejectedValue(new Error('always fails'));
      await expect(withRetry(fn, 1)).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
  });

  describe('non-blocking guarantee', () => {
    it('handler never throws even when DB is completely unavailable', async () => {
      // Use real timers because retry uses setTimeout-based sleep
      jest.useRealTimers();

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ error: new Error('DB down'), data: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: new Error('DB down'), data: null }),
        }),
        maybeSingle: jest.fn().mockResolvedValue({ data: [], error: null }),
      } as unknown as Record<string, jest.Mock>);

      const { startAuditConsumer } = await import('../utils/auditConsumer');
      startAuditConsumer();

      const tx = makeMockTx();
      // Handler must resolve without throwing
      await expect(capturedHandler!(tx)).resolves.toBeUndefined();
    }, 15_000);
  });

  describe('stopAuditConsumer', () => {
    it('unregisters the EventBus listener', () => {
      const unsubscribe = jest.fn();
      mockOn.mockReturnValue(unsubscribe);

       
      const { startAuditConsumer, stopAuditConsumer } = require('../utils/auditConsumer');

      startAuditConsumer();
      stopAuditConsumer();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
