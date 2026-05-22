/**
 * __tests__/eventBus.test.ts
 *
 * Tests for the process-internal EventBus (ADR-002).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { eventBus } from '../utils/eventBus';

import type { Transaction } from '../types/models';

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

/** Create a typed mock handler matching EventHandler<'transaction_built'>. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockHandler(): (...args: any[]) => void {
  return jest.fn<(...args: any[]) => void>();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('EventBus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    eventBus.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    eventBus.clear();
  });

  describe('on() / emit()', () => {
    it('calls registered handler when event is emitted', () => {
      const handler = mockHandler();
      eventBus.on('transaction_built', handler);

      const tx = makeMockTx();
      eventBus.emit('transaction_built', tx);

      jest.advanceTimersByTime(0);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(tx);
    });

    it('calls multiple handlers for the same event', () => {
      const handler1 = mockHandler();
      const handler2 = mockHandler();

      eventBus.on('transaction_built', handler1);
      eventBus.on('transaction_built', handler2);

      const tx = makeMockTx();
      eventBus.emit('transaction_built', tx);
      jest.advanceTimersByTime(0);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('emit() never blocks — handler errors are caught', () => {
      const errorHandler = jest.fn<() => void>().mockImplementation(() => {
        throw new Error('handler error');
      });

      eventBus.on('transaction_built', errorHandler);

      const tx = makeMockTx();
      expect(() => eventBus.emit('transaction_built', tx)).not.toThrow();

      jest.advanceTimersByTime(0);
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('emit() never blocks — async handler rejections are caught', () => {
      const asyncHandler = jest.fn<() => Promise<void>>().mockImplementation(() =>
        Promise.reject(new Error('async error')),
      );

      eventBus.on('transaction_built', asyncHandler);

      const tx = makeMockTx();
      expect(() => eventBus.emit('transaction_built', tx)).not.toThrow();

      jest.advanceTimersByTime(0);
      expect(asyncHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('once()', () => {
    it('calls handler only once', () => {
      const handler = mockHandler();
      eventBus.once('transaction_built', handler);

      eventBus.emit('transaction_built', makeMockTx());
      jest.advanceTimersByTime(0);
      expect(handler).toHaveBeenCalledTimes(1);

      eventBus.emit('transaction_built', makeMockTx({ id: 'TX-test-002' }));
      jest.advanceTimersByTime(0);
      expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('off()', () => {
    it('removes a registered handler', () => {
      const handler = mockHandler();
      eventBus.on('transaction_built', handler);
      eventBus.off('transaction_built', handler);

      eventBus.emit('transaction_built', makeMockTx());
      jest.advanceTimersByTime(0);

      expect(handler).not.toHaveBeenCalled();
    });

    it('unsubscribe function from on() works', () => {
      const handler = mockHandler();
      const unsub = eventBus.on('transaction_built', handler);
      unsub();

      eventBus.emit('transaction_built', makeMockTx());
      jest.advanceTimersByTime(0);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('removes all handlers for a specific event', () => {
      const handler = mockHandler();
      eventBus.on('transaction_built', handler);
      eventBus.clear('transaction_built');

      eventBus.emit('transaction_built', makeMockTx());
      jest.advanceTimersByTime(0);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
