/** Pure functions for reading and writing the `transactions` table. */

import { supabase } from '../supabaseClient';

import type { Transaction } from '../types/models';

const TX_FIELDS = [
  'id', 'timestamp', 'uploadTimestamp', 'locationId', 'locationName',
  'driverId', 'driverName', 'previousScore', 'currentScore', 'revenue',
  'commission', 'ownerRetention', 'isOwnerRetaining', 'debtDeduction', 'startupDebtDeduction',
  'expenses', 'coinExchange', 'extraIncome', 'netPayable', 'gps', 'gpsDeviation',
  'photoUrl', 'dataUsageKB', 'aiScore', 'isAnomaly', 'anomalyFlag', 'notes', 'isClearance',
  'isSynced', 'reportedStatus', 'paymentStatus', 'type', 'approvalStatus',
  'expenseType', 'expenseCategory', 'expenseStatus', 'expenseDescription',
  'payoutAmount',
].join(', ');

export interface FetchTransactionsOptions {
  isDriver: boolean;
  driverIdFilter?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchTransactions(opts: FetchTransactionsOptions): Promise<Transaction[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const fields = TX_FIELDS;
  let query = supabase
    .from('transactions')
    .select(fields)
    .order('timestamp', { ascending: false });
  if (opts.driverIdFilter) query = query.eq('driverId', opts.driverIdFilter);
  if (opts.limit) query = query.limit(opts.limit);
  if (opts.signal) query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw error;
  
  const result = (data ?? []) as unknown as Transaction[];
  
  // ✅ RLS 权限隔离前端验证：确保返回数据符合权限范围
  if (opts.isDriver && opts.driverIdFilter) {
    // Driver 用户只能看到自己的交易
    const violatedRecords = result.filter(tx => tx.driverId !== opts.driverIdFilter);
    if (violatedRecords.length > 0) {
      console.error(
        '[RLS Violation] fetchTransactions returned data with mismatched driverId:',
        violatedRecords.map(tx => ({ id: tx.id, expected: opts.driverIdFilter, actual: tx.driverId }))
      );
      throw new Error(
        `RLS violation: fetched ${violatedRecords.length} transaction(s) with incorrect driverId. ` +
        'This indicates Supabase RLS policy is not properly enforced.'
      );
    }
  }
  
  return result;
}

// Fields allowed for client-side upsert. Server-managed fields (e.g. idempotency
// markers, server-computed timestamps) are excluded to prevent accidental overwrite.
const UPSERT_ALLOWED_FIELDS = new Set([
  'id', 'timestamp', 'uploadTimestamp', 'locationId', 'locationName',
  'driverId', 'driverName', 'previousScore', 'currentScore', 'revenue',
  'commission', 'ownerRetention', 'isOwnerRetaining', 'debtDeduction', 'startupDebtDeduction',
  'expenses', 'coinExchange', 'extraIncome', 'netPayable', 'gps', 'gpsDeviation',
  'photoUrl', 'dataUsageKB', 'aiScore', 'isAnomaly', 'notes',
  'type', 'approvalStatus', 'paymentStatus', 'reportedStatus',
  'expenseType', 'expenseCategory', 'expenseStatus', 'expenseDescription',
  'payoutAmount', 'anomalyFlag',
]);

function stripDisallowedFields(tx: Partial<Transaction>): Partial<Transaction> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tx)) {
    if (UPSERT_ALLOWED_FIELDS.has(key)) {
      safe[key] = value;
    }
  }
  return safe as Partial<Transaction>;
}

export async function upsertTransaction(tx: Partial<Transaction>): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const safe = stripDisallowedFields(tx);
  const { error } = await supabase.from('transactions').upsert(safe);
  if (error) throw error;
}
