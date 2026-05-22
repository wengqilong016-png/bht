/**
 * Test fixture factories for domain types.
 *
 * Usage:
 *   const loc = makeLocation({ name: 'Custom' });
 *   const drv = makeDriver();
 *   const tx  = makeTransaction({ driverId: drv.id });
 */

import type { Location, Driver, Transaction, DailySettlement, User } from '../../types/models';

let counter = 0;
function uid(prefix = ''): string {
  counter += 1;
  return `${prefix}test-${counter}`;
}

export function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: uid('loc-'),
    name: `Test Location ${counter}`,
    machineId: `M-${counter}`,
    lastScore: 1000,
    area: 'Dar es Salaam',
    assignedDriverId: undefined,
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    status: 'active',
    commissionRate: 0.3,
    isSynced: true,
    ...overrides,
  };
}

export function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: uid('drv-'),
    name: `Driver ${counter}`,
    username: `driver${counter}@test.com`,
    phone: `+255700${String(counter).padStart(6, '0')}`,
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 100,
    vehicleInfo: { model: 'Bajaj', plate: `T-${counter}` },
    status: 'active',
    baseSalary: 500000,
    commissionRate: 0.1,
    isSynced: true,
    ...overrides,
  };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: uid('tx-'),
    timestamp: new Date().toISOString(),
    locationId: uid('loc-'),
    locationName: 'Test Location',
    driverId: uid('drv-'),
    previousScore: 1000,
    currentScore: 1200,
    revenue: 200,
    commission: 60,
    ownerRetention: 140,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 140,
    gps: { lat: -6.7924, lng: 39.2083 },
    dataUsageKB: 10,
    isSynced: true,
    ...overrides,
  };
}

export function makeDailySettlement(overrides: Partial<DailySettlement> = {}): DailySettlement {
  return {
    id: uid('ds-'),
    date: new Date().toISOString().slice(0, 10),
    totalRevenue: 5000,
    totalNetPayable: 3500,
    totalExpenses: 200,
    driverFloat: 100,
    expectedTotal: 3400,
    actualCash: 3400,
    actualCoins: 0,
    shortage: 0,
    timestamp: new Date().toISOString(),
    status: 'pending',
    isSynced: true,
    ...overrides,
  };
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: uid('usr-'),
    username: `user${counter}@test.com`,
    role: 'admin',
    name: `Test User ${counter}`,
    ...overrides,
  };
}

/** Reset the internal counter (call in beforeEach for deterministic IDs). */
export function resetFixtureCounter(): void {
  counter = 0;
}

/**
 * Create a mock CollectionSubmissionCalculations object from plain numbers.
 * Each field gets a minimal Money-like object with .toNumber() for tests.
 */
export function mockCalc(v: {
  diff?: number; revenue?: number; commission?: number;
  finalRetention?: number; startupDebtDeduction?: number;
  netPayable?: number; remainingCoins?: number;
} = {}): any {
  const m = (n: number) => ({
    toNumber: () => n,
    isNegative: () => n < 0,
    isZero: () => n === 0,
    isPositive: () => n > 0,
    equals: (o: any) => o?.toNumber?.() === n,
    isGreaterThan: (o: any) => n > (o?.toNumber?.() ?? 0),
    isLessThan: (o: any) => n < (o?.toNumber?.() ?? 0),
    isGreaterThanOrEqual: (o: any) => n >= (o?.toNumber?.() ?? 0),
    isLessThanOrEqual: (o: any) => n <= (o?.toNumber?.() ?? 0),
    toDecimal: () => String(n),
    toJSON: () => ({ amount: String(n), currency: 'TZS' }),
    toString: () => `${n} TZS`,
  });
  return {
    diff: m(v.diff ?? 200),
    revenue: m(v.revenue ?? 40000),
    commission: m(v.commission ?? 6000),
    finalRetention: m(v.finalRetention ?? 6000),
    startupDebtDeduction: m(v.startupDebtDeduction ?? 0),
    netPayable: m(v.netPayable ?? 34000),
    remainingCoins: m(v.remainingCoins ?? 29000),
    isCoinStockNegative: (v.remainingCoins ?? 29000) < 0,
    source: 'local',
  };
}
