/**
 * __tests__/scoreEventSourcing.test.ts
 *
 * Tests for score event sourcing (ADR-003: Hybrid event log + periodic snapshots).
 *
 * Two test groups:
 *   1. Algorithm tests — pure logic: given a sequence of events, verify
 *      recovery produces the correct score from various snapshot positions.
 *   2. RPC integration tests — mocked Supabase RPC call for recover_last_score.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ScoreEvent {
  id: string;
  locationId: string;
  oldScore: number | null;
  newScore: number;
  source: string;
  createdAt: number; // epoch ms
}

interface ScoreSnapshot {
  id: string;
  locationId: string;
  score: number;
  lastEventId: string | null;
  eventCount: number;
  snapshotAt: number; // epoch ms
}

interface RecoveryResult {
  locationId: string;
  recoveredScore: number;
  snapshotScore: number | null;
  snapshotId: string | null;
  snapshotEvents: number;
  eventsReplayed: number;
  totalEvents: number;
  method: 'snapshot+replay' | 'snapshot_only' | 'full_replay' | 'no_data';
}

// ═══════════════════════════════════════════════════════════════════════════
// Replay engine (mirrors recover_last_score() in Pl/pgSQL)
// ═══════════════════════════════════════════════════════════════════════════

function replayEvents(
  events: ScoreEvent[],
  snapshot?: ScoreSnapshot,
): { recoveredScore: number; eventsReplayed: number; totalEvents: number } {
  if (snapshot) {
    // Start from snapshot score, replay events after snapshot timestamp
    const snapshotTime = snapshot.snapshotAt;
    const eventsAfterSnapshot = events.filter(e => e.createdAt > snapshotTime);

    if (eventsAfterSnapshot.length === 0) {
      return {
        recoveredScore: snapshot.score,
        eventsReplayed: 0,
        totalEvents: snapshot.eventCount,
      };
    }

    // Last event by time, then by id for tie-breaking
    const sorted = [...eventsAfterSnapshot].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
    const lastEvent = sorted[sorted.length - 1];

    return {
      recoveredScore: lastEvent.newScore,
      eventsReplayed: eventsAfterSnapshot.length,
      totalEvents: snapshot.eventCount + eventsAfterSnapshot.length,
    };
  }

  // No snapshot: replay ALL events
  if (events.length === 0) {
    return { recoveredScore: 0, eventsReplayed: 0, totalEvents: 0 };
  }

  const sorted = [...events].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const lastEvent = sorted[sorted.length - 1];

  return {
    recoveredScore: lastEvent.newScore,
    eventsReplayed: events.length,
    totalEvents: events.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers: generate test events
// ═══════════════════════════════════════════════════════════════════════════

function makeEvent(
  id: string,
  newScore: number,
  createdAt: number,
  oldScore?: number,
): ScoreEvent {
  return {
    id,
    locationId: 'loc-test',
    oldScore: oldScore ?? null,
    newScore,
    source: 'update',
    createdAt,
  };
}

function makeSnapshot(
  id: string,
  score: number,
  lastEventId: string | null,
  eventCount: number,
  snapshotAt: number,
): ScoreSnapshot {
  return {
    id,
    locationId: 'loc-test',
    score,
    lastEventId,
    eventCount,
    snapshotAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Algorithm tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Score event sourcing — replay algorithm', () => {
  describe('full replay (no snapshot)', () => {
    it('returns 0 when there are no events', () => {
      const result = replayEvents([]);
      expect(result.recoveredScore).toBe(0);
      expect(result.eventsReplayed).toBe(0);
      expect(result.totalEvents).toBe(0);
    });

    it('returns the last event newScore for a single event', () => {
      const events = [makeEvent('evt-1', 500, 1000)];
      const result = replayEvents(events);
      expect(result.recoveredScore).toBe(500);
      expect(result.eventsReplayed).toBe(1);
    });

    it('returns the chronologically last event newScore', () => {
      const events = [
        makeEvent('evt-1', 100, 1000),
        makeEvent('evt-2', 300, 2000),
        makeEvent('evt-3', 150, 3000), // score went down (reset-like)
      ];
      const result = replayEvents(events);
      expect(result.recoveredScore).toBe(150);
      expect(result.eventsReplayed).toBe(3);
    });

    it('handles monotonically increasing scores', () => {
      const events = [
        makeEvent('evt-1', 500, 1000),
        makeEvent('evt-2', 1200, 2000),
        makeEvent('evt-3', 2500, 3000),
        makeEvent('evt-4', 4200, 4000),
        makeEvent('evt-5', 7800, 5000),
      ];
      const result = replayEvents(events);
      expect(result.recoveredScore).toBe(7800);
      expect(result.eventsReplayed).toBe(5);
    });

    it('handles out-of-order insertion (sorts by time, then id)', () => {
      const events = [
        makeEvent('evt-c', 300, 3000),
        makeEvent('evt-a', 100, 1000),
        makeEvent('evt-b', 200, 2000),
      ];
      const result = replayEvents(events);
      // Last by time should be evt-c at 3000 with score 300
      expect(result.recoveredScore).toBe(300);
    });

    it('tie-breaks by id when timestamps are equal', () => {
      const events = [
        makeEvent('evt-a', 100, 2000),
        makeEvent('evt-b', 200, 2000),
      ];
      const result = replayEvents(events);
      expect(result.recoveredScore).toBe(200);
    });
  });

  describe('snapshot + replay', () => {
    const events = [
      makeEvent('evt-1', 500, 1000),
      makeEvent('evt-2', 1200, 2000),
      makeEvent('evt-3', 2500, 3000),
      makeEvent('evt-4', 4200, 4000),
      makeEvent('evt-5', 7800, 5000),
    ];

    it('snapshot covers all events (no replay needed)', () => {
      const snapshot = makeSnapshot('snap-1', 7800, 'evt-5', 5, 6000);
      const result = replayEvents(events, snapshot);
      expect(result.recoveredScore).toBe(7800);
      expect(result.eventsReplayed).toBe(0);
      expect(result.totalEvents).toBe(5);
    });

    it('snapshot covers first 3 events, replays remaining 2', () => {
      const snapshot = makeSnapshot('snap-1', 2500, 'evt-3', 3, 3500);
      const result = replayEvents(events, snapshot);
      // Events after 3500: evt-4 (4000, 4200) and evt-5 (5000, 7800)
      expect(result.recoveredScore).toBe(7800);
      expect(result.eventsReplayed).toBe(2);
      expect(result.totalEvents).toBe(5);
    });

    it('snapshot at 0 before any events', () => {
      const snapshot = makeSnapshot('snap-1', 0, null, 0, 500);
      const result = replayEvents(events, snapshot);
      // All events are after 500
      expect(result.recoveredScore).toBe(7800);
      expect(result.eventsReplayed).toBe(5);
    });

    it('snapshot between events, replays only later ones', () => {
      const snapshot = makeSnapshot('snap-mid', 1200, 'evt-2', 2, 2500);
      const result = replayEvents(events, snapshot);
      // Events after 2500: evt-3, evt-4, evt-5
      expect(result.recoveredScore).toBe(7800);
      expect(result.eventsReplayed).toBe(3);
    });

    it('handles score reset to 0 after snapshot', () => {
      const resetEvents = [
        makeEvent('evt-1', 5000, 1000),
        makeEvent('evt-2', 9500, 2000), // near overflow
        makeEvent('evt-3', 0, 3000),    // reset
        makeEvent('evt-4', 200, 4000),   // post-reset
      ];
      const snapshot = makeSnapshot('snap-pre-reset', 9500, 'evt-2', 2, 2500);
      const result = replayEvents(resetEvents, snapshot);
      // After 2500: evt-3 (0) and evt-4 (200). Last by time: evt-4 = 200
      expect(result.recoveredScore).toBe(200);
      expect(result.eventsReplayed).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('events with negative scores (theoretical edge case)', () => {
      const events = [
        makeEvent('evt-1', -100, 1000),
        makeEvent('evt-2', 50, 2000),
      ];
      const result = replayEvents(events);
      expect(result.recoveredScore).toBe(50);
    });

    it('large number of events (simulate 10,000 events)', () => {
      const events: ScoreEvent[] = [];
      for (let i = 0; i < 10000; i++) {
        events.push(makeEvent(`evt-${i}`, i * 10, i * 1000));
      }
      const snapshot = makeSnapshot('snap-big', 50000, 'evt-5000', 5000, 5000000 - 1);
      const result = replayEvents(events, snapshot);
      expect(result.recoveredScore).toBe(99990);
      expect(result.eventsReplayed).toBe(5000); // evt-5000..evt-9999 all after snapshot
      expect(result.totalEvents).toBe(10000);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RPC integration tests (mocked Supabase)
// ═══════════════════════════════════════════════════════════════════════════

// Mock Supabase RPC
const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();

function makeRpcBuilder(inner: Promise<unknown>) {
  const builder = {
    then: inner.then.bind(inner),
    catch: inner.catch.bind(inner),
    finally: inner.finally.bind(inner),
  };
  return builder;
}

jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => makeRpcBuilder(mockRpc(...args) as Promise<unknown>),
  },
}));

// Simple client adapter (inline to avoid adding files)
async function callRecoverLastScore(locationId: string): Promise<RecoveryResult> {
  // Dynamic import to ensure mock is active
  const { supabase } = await import('../supabaseClient');
  const result = await supabase.rpc('recover_last_score', { p_location_id: locationId });
  const rpcResult = result as { data: RecoveryResult; error: unknown };
  if (rpcResult.error) {
    throw new Error(String(rpcResult.error));
  }
  return rpcResult.data;
}

describe('recover_last_score RPC (mocked)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns recovered score from RPC response', async () => {
    const mockResponse: RecoveryResult = {
      locationId: 'loc-123',
      recoveredScore: 7800,
      snapshotScore: 2500,
      snapshotId: 'snap-abc',
      snapshotEvents: 3,
      eventsReplayed: 2,
      totalEvents: 5,
      method: 'snapshot+replay',
    };

    mockRpc.mockResolvedValue({ data: mockResponse, error: null });

    const result = await callRecoverLastScore('loc-123');

    expect(result.recoveredScore).toBe(7800);
    expect(result.method).toBe('snapshot+replay');
    expect(result.snapshotEvents).toBe(3);
    expect(result.eventsReplayed).toBe(2);
    expect(mockRpc).toHaveBeenCalledWith('recover_last_score', { p_location_id: 'loc-123' });
  });

  it('handles no_data method (no events, no snapshot)', async () => {
    const mockResponse: RecoveryResult = {
      locationId: 'loc-empty',
      recoveredScore: 0,
      snapshotScore: null,
      snapshotId: null,
      snapshotEvents: 0,
      eventsReplayed: 0,
      totalEvents: 0,
      method: 'no_data',
    };

    mockRpc.mockResolvedValue({ data: mockResponse, error: null });

    const result = await callRecoverLastScore('loc-empty');

    expect(result.recoveredScore).toBe(0);
    expect(result.method).toBe('no_data');
  });

  it('handles full_replay method (events but no snapshot)', async () => {
    const mockResponse: RecoveryResult = {
      locationId: 'loc-fresh',
      recoveredScore: 500,
      snapshotScore: null,
      snapshotId: null,
      snapshotEvents: 0,
      eventsReplayed: 15,
      totalEvents: 15,
      method: 'full_replay',
    };

    mockRpc.mockResolvedValue({ data: mockResponse, error: null });

    const result = await callRecoverLastScore('loc-fresh');

    expect(result.method).toBe('full_replay');
    expect(result.recoveredScore).toBe(500);
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: 'Location not found' });

    await expect(callRecoverLastScore('loc-bad')).rejects.toThrow('Location not found');
  });
});
