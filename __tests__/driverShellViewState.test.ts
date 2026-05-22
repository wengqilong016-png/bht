/**
 * __tests__/driverShellViewState.test.ts
 *
 * Tests for driver/driverShellViewState.ts
 */
import { describe, it, expect } from '@jest/globals';

import { resolveCurrentDriver } from '../driver/driverShellViewState';

import type { Driver } from '../types';

function makeDriver(id: string, name: string): Driver {
  return {
    id,
    name,
    username: id,
    phone: '',
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 100,
    vehicleInfo: '',
    currentGps: null,
    lastActive: null,
    status: 'active',
    baseSalary: 0,
    commissionRate: 15,
    isSynced: true,
  } as unknown as Driver;
}

describe('resolveCurrentDriver()', () => {
  const alice = makeDriver('drv-alice', 'Alice');
  const bob = makeDriver('drv-bob', 'Bob');

  it('returns the driver matching activeDriverId', () => {
    const result = resolveCurrentDriver([alice, bob], 'drv-bob');
    expect(result?.id).toBe('drv-bob');
  });

  it('returns undefined when activeDriverId is not found (no fallback)', () => {
    const result = resolveCurrentDriver([alice, bob], 'drv-unknown');
    expect(result).toBeUndefined();
  });

  it('returns undefined when activeDriverId is not provided (no fallback)', () => {
    const result = resolveCurrentDriver([alice, bob], undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined when drivers array is empty', () => {
    expect(resolveCurrentDriver([], undefined)).toBeUndefined();
  });

  it('returns undefined when drivers is empty and activeDriverId is provided', () => {
    expect(resolveCurrentDriver([], 'drv-alice')).toBeUndefined();
  });

  it('returns undefined when there is only one driver but no activeDriverId', () => {
    const result = resolveCurrentDriver([alice], undefined);
    expect(result).toBeUndefined();
  });

  it('returns driver by id even if not first in list', () => {
    const result = resolveCurrentDriver([alice, bob], 'drv-alice');
    expect(result?.id).toBe('drv-alice');
    expect(result?.name).toBe('Alice');
  });
});
