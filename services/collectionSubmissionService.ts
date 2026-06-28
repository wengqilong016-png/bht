/**
 * collectionSubmissionService.ts
 *
 * Stage-2 server-authoritative collection submission.
 *
 * When online, the client sends raw collection inputs to `submit_collection_v2`
 * on the server. The server recomputes all finance fields and returns the
 * persisted, normalized transaction. The client never acts as the final
 * authority for finance totals on the write path.
 *
 * When offline (or Supabase is not configured), the caller is expected to
 * build a local transaction via `createCollectionTransaction` and enqueue it
 * for later sync. This service only handles the online path.
 */

import { supabase } from '../supabaseClient';
import { Transaction } from '../types';

import { persistEvidencePhotoUrl } from './evidenceStorage';

const MISSING_COLLECTION_PHOTO_ERROR = 'Missing required collection evidence photoUrl';
const INVALID_COLLECTION_PHOTO_ERROR = 'Invalid collection evidence photoUrl';
const FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR = 'Evidence photo persistence failed for required collection photoUrl';

function isValidHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** NaN-safe number coercion. `??` passes NaN through, so we must guard explicitly. */
function safeNumber(value: unknown, fallback: number = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/** Runtime NaN guard + range validation — prevents server-returned NaN or
 *  out-of-range coordinates from polluting GPS data. */
function isValidGps(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== 'object') return false;
  const gps = value as { lat: number; lng: number };
  return typeof gps.lat === 'number' && !Number.isNaN(gps.lat) && Math.abs(gps.lat) <= 90
      && typeof gps.lng === 'number' && !Number.isNaN(gps.lng) && Math.abs(gps.lng) <= 180;
}

function isDataImageUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}

/**
 * Raw inputs accepted by the server write entrypoint.
 * These mirror the driver's form data — no pre-computed finance totals.
 */
export interface CollectionSubmissionInput {
  /** Client-generated draft ID used for idempotency. */
  txId: string;
  locationId: string;
  driverId: string;
  currentScore: number;
  expenses: number;
  /** Tip / gratuity paid out by the driver at the machine site (deducted from net payable). */
  tip: number;
  /** Manual merchant/site debt deduction for this collection. */
  startupDebtDeduction: number;
  isOwnerRetaining: boolean;
  /** Explicit owner amount; null means "use system commission result". */
  ownerRetention: number | null;
  coinExchange: number;
  gps: { lat: number; lng: number } | null;
  photoUrl: string | null;
  aiScore: number | null;
  anomalyFlag: boolean;
  notes: string | null;
  expenseType: 'public' | 'private' | null;
  expenseCategory: Transaction['expenseCategory'] | null;
  expenseDescription?: string;
  reportedStatus: 'active' | 'maintenance' | 'broken';
  /** Optional ISO timestamp for admin back-dating. When set, the server uses this instead of now(). */
  timestamp?: string;
  /** Admin override — allows negative score diff (rollover/correction). Only honored for admin callers. */
  adminOverride?: boolean;
}

/** Discriminated result so callers can branch on success / source. */
export type CollectionSubmissionFailureKind = 'evidence' | 'rpc' | 'config' | 'network';

export type CollectionSubmissionResult =
  | { success: true; transaction: Transaction; source: 'server'; idempotentReplay?: boolean }
  | { success: false; error: string; kind?: CollectionSubmissionFailureKind };

export interface CollectionSubmissionRequestOptions {
  signal?: AbortSignal;
  /**
   * Driver submissions must keep evidence photos mandatory. Admin-only manual
   * entry can set this false to submit an audited row without photo/GPS.
   */
  requireEvidencePhoto?: boolean;
}

export function isFailure(
  result: CollectionSubmissionResult,
): result is { success: false; error: string; kind?: CollectionSubmissionFailureKind } {
  return result.success === false;
}

function classifyRpcException(error: unknown): CollectionSubmissionFailureKind {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    message.includes('timeout') ||
    message.includes('abort') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline') ||
    message.includes('connection')
  ) {
    return 'network';
  }
  return 'rpc';
}

/**
 * Submit a collection to the server-authoritative write entrypoint.
 *
 * On success the returned transaction uses server-computed finance values
 * and is already persisted (`isSynced: true`).
 *
 * Returns `{ success: false }` when Supabase is not configured, which the
 * caller should treat as "proceed with offline path".
 */
export async function submitCollectionV2(
  input: CollectionSubmissionInput,
  options: CollectionSubmissionRequestOptions = {},
): Promise<CollectionSubmissionResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured', kind: 'config' };
  }

  const requireEvidencePhoto = options.requireEvidencePhoto ?? true;
  const hasEvidencePhoto = !!input.photoUrl?.trim();

  if (requireEvidencePhoto && !hasEvidencePhoto) {
    return { success: false, error: MISSING_COLLECTION_PHOTO_ERROR, kind: 'evidence' };
  }

  if (hasEvidencePhoto && !isDataImageUrl(input.photoUrl) && !isValidHttpUrl(input.photoUrl)) {
    return { success: false, error: INVALID_COLLECTION_PHOTO_ERROR, kind: 'evidence' };
  }

  let persistedPhotoUrl: string | null = null;
  try {
    if (hasEvidencePhoto) {
      persistedPhotoUrl = await persistEvidencePhotoUrl(input.photoUrl, {
        category: 'collection',
        entityId: input.txId,
        driverId: input.driverId,
        required: requireEvidencePhoto,
      });
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { success: false, error: `${FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR}: ${detail}`, kind: 'evidence' };
  }

  if (requireEvidencePhoto && !isValidHttpUrl(persistedPhotoUrl)) {
    return { success: false, error: FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR, kind: 'evidence' };
  }

  let data: unknown;
  let error: { message?: string } | null;
  try {
    // Apply a 30-second hard timeout so a hung server response does not keep
    // the SyncStatusPill spinning in "Syncing…" state indefinitely.
    const result = await supabase.rpc('submit_collection_v2', {
      p_tx_id:             input.txId,
      p_location_id:       input.locationId,
      p_driver_id:         input.driverId,
      p_current_score:     input.currentScore,
      p_expenses:          input.expenses,
      p_tip:               input.tip,
      p_startup_debt_deduction: input.startupDebtDeduction,
      p_is_owner_retaining: input.isOwnerRetaining,
      p_owner_retention:   input.ownerRetention,
      p_coin_exchange:     input.coinExchange,
      p_gps:               input.gps,
      p_photo_url:         persistedPhotoUrl,
      p_ai_score:          input.aiScore,
      p_anomaly_flag:      input.anomalyFlag,
      p_notes:             input.notes,
      p_expense_type:      input.expenseType,
      p_expense_category:  input.expenseCategory,
      p_reported_status:   input.reportedStatus,
      p_expense_description: input.expenseDescription ?? null,
      p_timestamp:          input.timestamp ?? null,
      p_admin_override:     input.adminOverride ?? false,
    }).abortSignal(options.signal ?? AbortSignal.timeout(30_000));
    data = result.data;
    error = result.error as { message?: string } | null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error calling submit_collection_v2';
    return { success: false, error: msg, kind: classifyRpcException(e) };
  }

  if (error || !data) {
    return {
      success: false,
      error: (error as { message?: string } | null)?.message || 'submit_collection_v2 returned no data',
      kind: 'rpc',
    };
  }

  // Gate 2: RPC executed but returned an internal error payload
  // (e.g. EXCEPTION block in the SQL function returns json_build_object('error', ...)).
  const rpcData = data as Record<string, unknown>;
  if (rpcData['error']) {
    return {
      success: false,
      error: String(rpcData['error']),
      kind: 'rpc',
    };
  }

  // Gate 3: Idempotent replay — ON CONFLICT (id) DO NOTHING returned an
  // existing row. This is a successful replay of already-committed state,
  // not a new submission.
  const isIdempotentReplay = rpcData['tx_conflict'] === true;

  // Normalize the server JSON payload
  const row = data as Record<string, unknown>;
  const transaction: Transaction = {
    id:                    String(row['id'] ?? input.txId),
    timestamp:             String(row['timestamp'] ?? new Date().toISOString()),
    uploadTimestamp:       String(row['timestamp'] ?? new Date().toISOString()),
    locationId:            String(row['locationId'] ?? input.locationId),
    locationName:          String(row['locationName'] ?? ''),
    driverId:              String(row['driverId'] ?? input.driverId),
    driverName:            row['driverName'] != null ? String(row['driverName']) : undefined,
    previousScore:         safeNumber(row['previousScore']),
    currentScore:          safeNumber(row['currentScore'], input.currentScore),
    revenue:               safeNumber(row['revenue']),
    commission:            safeNumber(row['commission']),
    ownerRetention:        safeNumber(row['ownerRetention']),
    isOwnerRetaining:      row['isOwnerRetaining'] == null ? input.isOwnerRetaining : Boolean(row['isOwnerRetaining']),
    debtDeduction:         safeNumber(row['debtDeduction']),
    startupDebtDeduction:  safeNumber(row['startupDebtDeduction']),
    expenses:              safeNumber(row['expenses'], input.expenses),
    tip:                   safeNumber(row['tip'], input.tip),
    coinExchange:          safeNumber(row['coinExchange'], input.coinExchange),
    extraIncome:           safeNumber(row['extraIncome']),
    netPayable:            safeNumber(row['netPayable']),
    gps:                   (isValidGps(row['gps']) ? (row['gps'] as { lat: number; lng: number }) : undefined) ?? input.gps ?? { lat: 0, lng: 0 },
    photoUrl:              isValidHttpUrl(row['photoUrl'] != null ? String(row['photoUrl']) : null)
                             ? String(row['photoUrl'])
                             : persistedPhotoUrl ?? undefined,
    dataUsageKB:           safeNumber(row['dataUsageKB'], 120),
    aiScore:               row['aiScore'] != null ? safeNumber(row['aiScore']) : undefined,
    isAnomaly:             Boolean(row['isAnomaly']),
    anomalyFlag:           Boolean(row['anomalyFlag'] ?? row['isAnomaly']),
    isSynced:              true,
    type:                  'collection',
    approvalStatus:        'approved',
    paymentStatus:         (row['paymentStatus'] as Transaction['paymentStatus']) ?? 'pending',
    reportedStatus:        (row['reportedStatus'] as Transaction['reportedStatus']) ?? 'active',
    notes:                 row['notes'] != null ? String(row['notes']) : undefined,
    expenseType:           row['expenseType'] != null
                             ? (row['expenseType'] as Transaction['expenseType'])
                             : undefined,
    expenseCategory:       row['expenseCategory'] != null
                             ? (row['expenseCategory'] as Transaction['expenseCategory'])
                             : undefined,
    expenseStatus:         row['expenseStatus'] != null
                             ? (row['expenseStatus'] as Transaction['expenseStatus'])
                             : undefined,
    expenseDescription:    row['expenseDescription'] != null
                             ? String(row['expenseDescription'])
                             : undefined,
  };

  // Post-construction integrity check: all numeric fields must be finite
  const numericFields = ['previousScore','currentScore','revenue','commission','ownerRetention',
    'debtDeduction','startupDebtDeduction','expenses','tip','coinExchange','extraIncome','netPayable'] as const;
  for (const f of numericFields) {
    if (!Number.isFinite(transaction[f] as number)) {
      throw new Error(`submit_collection_v2 returned non-finite ${f}: ${transaction[f]}`);
    }
  }

  // ── Write finance audit to Postgres (fire-and-forget with 2 retries, must not block main flow) ──
  if (!isIdempotentReplay) {
    void (async () => {
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (supabase) {
            await supabase.from('finance_audit_log').insert({
            event_type: 'collection_submission',
            entity_type: 'location',
            entity_id: input.locationId,
            entity_name: transaction.locationName || null,
            actor_id: input.driverId,
            old_value: transaction.previousScore,
            new_value: transaction.currentScore,
            payload: {
              txId: transaction.id,
              revenue: transaction.revenue,
              commission: transaction.commission,
              debtDeduction: transaction.debtDeduction,
              startupDebtDeduction: transaction.startupDebtDeduction,
              expenses: transaction.expenses,
              tip: transaction.tip,
              coinExchange: transaction.coinExchange,
              netPayable: transaction.netPayable,
              isOwnerRetaining: transaction.isOwnerRetaining,
              ownerRetention: transaction.ownerRetention,
              timestamp: transaction.timestamp,
            },
          });
        }
        break; // success — exit retry loop
      } catch {
        // Audit must never block the main flow
        if (attempt === maxRetries) {
          console.warn('[FinanceAudit] audit write failed after retries — audit record lost for tx:', transaction.id);
        }
      }
    }
    })();
  }

  return {
    success: true,
    transaction,
    source: 'server',
    ...(isIdempotentReplay ? { idempotentReplay: true } : {}),
  };
}
