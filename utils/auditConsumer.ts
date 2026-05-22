/**
 * AuditConsumer (ADR-002) — async transaction audit pipeline.
 *
 * Listens to `transaction_built` events from the EventBus,
 * performs semantic & power-law dedup checks, writes audit_log
 * entries to Supabase, and updates transaction.audit_status.
 *
 * Key properties:
 * - Non-blocking: the emitter never waits for audit to finish.
 * - Retry: exponential backoff, max 3 attempts.
 * - Failure is logged but does not affect the main transaction flow.
 */

import { supabase } from '../supabaseClient';
import { eventBus } from './eventBus';

import type { Transaction, TransactionAuditLogEntry } from '../types/models';

// ── Constants ────────────────────────────────────────────────────────────────

/** Max retry attempts for audit operations. */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff (1s, 2s, 4s). */
const BASE_DELAY_MS = 1000;

/** Time window (ms) for power-law dedup scan. */
const DEDUP_WINDOW_MS = 60_000; // 60 seconds

// ── Sleep helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Audit checks ─────────────────────────────────────────────────────────────

interface AuditResult {
  result: 'pass' | 'fail';
  checkedFields: string[];
  failureReason?: string;
}

/**
 * Semantic validation: ensure the transaction's internal fields are
 * consistent for its type.
 */
function semanticCheck(tx: Transaction): string[] {
  const issues: string[] = [];

  // All types: required identity fields
  if (!tx.locationId) issues.push('missing locationId');
  if (!tx.driverId) issues.push('missing driverId');
  if (!tx.timestamp) issues.push('missing timestamp');

  // Type-specific checks
  if (tx.type === 'collection') {
    // Collection: currentScore must be >= previousScore
    if (tx.currentScore < tx.previousScore) {
      issues.push(`currentScore (${tx.currentScore}) < previousScore (${tx.previousScore})`);
    }
    // Revenue should be consistent with score delta
    if (tx.revenue < 0) issues.push('negative revenue');
  }

  if (tx.type === 'expense') {
    if (!tx.expenses || tx.expenses <= 0) issues.push('expense transaction with non-positive amount');
    if (!tx.expenseType) issues.push('missing expenseType');
  }

  if (tx.type === 'payout_request') {
    if (!tx.payoutAmount || tx.payoutAmount <= 0) issues.push('payout request with non-positive amount');
  }

  return issues;
}

/**
 * Power-law dedup check: query recent transactions for the same driver+location
 * within the dedup window. Returns issues if suspicious duplicates are found.
 */
async function powerLawDedupCheck(tx: Transaction): Promise<string[]> {
  if (!supabase) return []; // Can't check without DB — not a failure

  try {
    const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

    const { data, error } = await supabase
      .from('transactions')
      .select('id, timestamp, type')
      .eq('driverId', tx.driverId)
      .eq('locationId', tx.locationId)
      .gte('timestamp', windowStart)
      .neq('id', tx.id);

    if (error) {
      console.warn('[AuditConsumer] dedup query failed:', error.message);
      return []; // Query failure is not an audit failure
    }

    const similar = (data ?? []) as { id: string; timestamp: string; type: string }[];

    // Flag if there are >2 similar transactions for the same driver+location+type in the window
    const sameType = similar.filter((r) => r.type === tx.type);
    if (sameType.length > 2) {
      return [`power-law dedup: ${sameType.length + 1} same-type transactions in ${DEDUP_WINDOW_MS}ms window`];
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Run all audit checks against a transaction.
 * Returns pass/fail with the list of checked fields.
 */
async function runAuditChecks(tx: Transaction): Promise<AuditResult> {
  const checkedFields: string[] = ['semantic', 'power-law-dedup'];

  const semanticIssues = semanticCheck(tx);
  const dedupIssues = await powerLawDedupCheck(tx);

  const allIssues = [...semanticIssues, ...dedupIssues];

  if (allIssues.length > 0) {
    return {
      result: 'fail',
      checkedFields,
      failureReason: allIssues.join('; '),
    };
  }

  return { result: 'pass', checkedFields };
}

// ── Retry wrapper ────────────────────────────────────────────────────────────

/**
 * Execute an async operation with exponential backoff retry.
 * Retries up to maxRetries times, doubling the delay each time.
 * Returns the result on first success, or throws on final failure.
 *
 * Exported for testability.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[AuditConsumer] attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms:`,
          err,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ── Audit log persistence ────────────────────────────────────────────────────

/**
 * Write an audit log entry to Supabase and update the transaction's audit_status.
 * Called with retry on transient failures.
 */
async function persistAuditResult(
  tx: Transaction,
  result: AuditResult,
  attempt: number,
): Promise<void> {
  if (!supabase) {
    console.warn('[AuditConsumer] Supabase unavailable, skipping audit persist');
    return;
  }

  const entry: Omit<TransactionAuditLogEntry, 'id'> = {
    transactionId: tx.id,
    transactionType: tx.type ?? 'unknown',
    locationId: tx.locationId,
    driverId: tx.driverId,
    checkedFields: result.checkedFields,
    result: result.result,
    failureReason: result.failureReason,
    attempt,
    createdAt: new Date().toISOString(),
  };

  await withRetry(async () => {
    // Insert audit log entry
    const { error: logError } = await supabase!
      .from('transaction_audit_log')
      .insert(entry);

    if (logError) throw logError;

    // Update transaction audit_status
    const { error: txError } = await supabase!
      .from('transactions')
      .update({ auditStatus: result.result === 'pass' ? 'done' : 'failed' })
      .eq('id', tx.id);

    if (txError) throw txError;
  });
}

// ── Consumer ─────────────────────────────────────────────────────────────────

let unsubscribe: (() => void) | null = null;

/**
 * Start the AuditConsumer. Registers a listener on the EventBus.
 * Safe to call multiple times — previous subscription is cleaned up first.
 */
export function startAuditConsumer(): void {
  if (unsubscribe) {
    console.warn('[AuditConsumer] already running, restarting...');
    unsubscribe();
  }

  unsubscribe = eventBus.on('transaction_built', async (tx: Transaction) => {
    // Run audit checks
    const result = await runAuditChecks(tx);

    // Persist result (withRetry inside persistAuditResult handles transient failures)
    try {
      await persistAuditResult(tx, result, 0);
    } catch (err) {
      // Audit failure must never propagate to the caller
      console.error(
        `[AuditConsumer] audit persist failed for tx ${tx.id}: ${result.result}`,
        err,
      );
    }
  });
}

/**
 * Stop the AuditConsumer. Unregisters the EventBus listener.
 */
export function stopAuditConsumer(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
