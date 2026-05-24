import { enqueueTransaction } from '../offlineQueue';
import { CONSTANTS } from '../types';
import { clampCollectionAmount } from '../utils/collectionAmountLimits';
import { createCollectionTransaction } from '../utils/transactionBuilder';
import { Money } from '../utils/money';

import { appendCollectionSubmissionAudit } from './collectionSubmissionAudit';
import {
  isFailure,
  submitCollectionV2,
  type CollectionSubmissionInput,
  type CollectionSubmissionResult,
} from './collectionSubmissionService';

import type { Driver, Location, Transaction } from '../types';

export type SubmissionGpsSource = 'live' | 'exif' | 'estimated' | 'none';

/** Money-typed calculations from the finance preview. */
export interface CollectionSubmissionCalculations {
  diff: Money;
  revenue: Money;
  commission: Money;
  finalRetention: Money;
  startupDebtDeduction: Money;
  netPayable: Money;
  remainingCoins: Money;
  isCoinStockNegative: boolean;
}

export interface CollectionSubmissionAiReview {
  score?: string | null;
  condition?: string | null;
  notes?: string | null;
}

export interface OrchestrateCollectionSubmissionInput {
  selectedLocation: Location;
  currentDriver: Driver;
  isOnline: boolean;
  currentScore: string;
  photoData: string | null;
  aiReviewData: CollectionSubmissionAiReview | null;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  expenseDescription?: string;
  coinExchange: string;
  tip: string;
  draftTxId: string;
  isOwnerRetaining: boolean;
  ownerRetention: string;
  calculations: CollectionSubmissionCalculations;
  resolvedGps: { lat: number; lng: number };
  gpsSourceType: SubmissionGpsSource;
}

export type OrchestratedCollectionSubmissionResult =
  | { source: 'server'; transaction: Transaction; fallbackReason: null }
  | { source: 'offline'; transaction: Transaction; fallbackReason: string | null };

export interface CollectionSubmissionOrchestratorDeps {
  submitCollectionV2: (input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>;
  createCollectionTransaction: typeof createCollectionTransaction;
  enqueueTransaction: typeof enqueueTransaction;
  logger: Pick<Console, 'warn'>;
}

const defaultDeps: CollectionSubmissionOrchestratorDeps = {
  submitCollectionV2,
  createCollectionTransaction,
  enqueueTransaction,
  logger: console,
};

function normalizeReportedStatus(
  condition: string | null | undefined,
  fallbackStatus: Location['status'] | undefined,
): 'active' | 'maintenance' | 'broken' {
  const normalizedCondition = condition?.trim().toLowerCase();

  if (normalizedCondition) {
    if (['damaged', 'issue', 'broken', 'fault', 'error'].includes(normalizedCondition)) {
      return 'broken';
    }
    if (['maintenance', 'repair', 'servicing'].includes(normalizedCondition)) {
      return 'maintenance';
    }
    if (['normal', 'active', 'ok', 'healthy'].includes(normalizedCondition)) {
      return 'active';
    }
  }

  if (fallbackStatus === 'maintenance' || fallbackStatus === 'broken') {
    return fallbackStatus;
  }

  return 'active';
}

function buildOfflineTransaction(
  input: OrchestrateCollectionSubmissionInput,
  rawInput: CollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps,
): Transaction {
  const offlineTransaction = deps.createCollectionTransaction(
    input.selectedLocation,
    input.currentDriver,
    input.resolvedGps,
    rawInput.currentScore, // this is a coin count, not money — sent as number to RPC
    {
      txId: input.draftTxId,
      revenue: input.calculations.revenue.toNumber(),
      commission: input.calculations.commission.toNumber(),
      ownerRetention: input.calculations.finalRetention.toNumber(),
      isOwnerRetaining: input.isOwnerRetaining,
      startupDebtDeduction: input.calculations.startupDebtDeduction.toNumber(),
      expenses: rawInput.expenses,
      tip: rawInput.tip,
      coinExchange: rawInput.coinExchange,
      netPayable: input.calculations.netPayable.toNumber(),
      photoUrl: input.photoData || undefined,
      dataUsageKB: 120,
      notes: rawInput.notes || undefined,
      anomalyFlag: rawInput.anomalyFlag,
    },
  );

  offlineTransaction.expenseType = rawInput.expenseType ?? undefined;
  offlineTransaction.expenseCategory = rawInput.expenseCategory ?? undefined;
  offlineTransaction.expenseDescription = rawInput.expenseDescription;
  offlineTransaction.expenseStatus = rawInput.expenseType ? 'pending' : undefined;
  offlineTransaction.paymentStatus = 'pending';
  offlineTransaction.aiScore = rawInput.aiScore ?? undefined;
  offlineTransaction.reportedStatus = rawInput.reportedStatus;

  return offlineTransaction;
}

async function enqueueOfflineTransaction(
  offlineTransaction: Transaction,
  rawInput: CollectionSubmissionInput,
  input: OrchestrateCollectionSubmissionInput,
  reason: string,
  deps: CollectionSubmissionOrchestratorDeps,
): Promise<void> {
  try {
    await deps.enqueueTransaction(offlineTransaction, rawInput);
    appendCollectionSubmissionAudit({
      timestamp: new Date().toISOString(),
      event: 'submit_offline_enqueued',
      txId: offlineTransaction.id,
      locationId: offlineTransaction.locationId,
      locationName: offlineTransaction.locationName,
      driverId: offlineTransaction.driverId,
      currentScoreRaw: input.currentScore,
      resolvedScore: offlineTransaction.currentScore,
      previousScore: offlineTransaction.previousScore,
      source: 'offline',
      reason,
    });
  } catch (error) {
    deps.logger.warn('[collectionSubmissionOrchestrator] IDB enqueue failed:', error);
    throw new Error(
      `采集数据暂存失败，请截图并联系管理员。/ Collection could not be saved locally. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function buildCollectionSubmissionInput(
  input: OrchestrateCollectionSubmissionInput,
): CollectionSubmissionInput {
  const expenseValue = clampCollectionAmount('expenses', input.expenses);
  const trimmedScore = input.currentScore.trim();
  const cleanScore = trimmedScore.replace(/,/g, '');
  const numericScore = Number(cleanScore);
  const parsedScore = Math.floor(numericScore);
  const isInvalidScore =
    trimmedScore === '' ||
    Number.isNaN(numericScore) ||
    Number.isNaN(parsedScore);
  if (isInvalidScore) {
    appendCollectionSubmissionAudit({
      timestamp: new Date().toISOString(),
      event: 'submit_invalid_score',
      txId: input.draftTxId,
      locationId: input.selectedLocation.id,
      locationName: input.selectedLocation.name,
      driverId: input.currentDriver.id,
      currentScoreRaw: input.currentScore,
      previousScore: input.selectedLocation.lastScore,
      reason: 'Current score was empty or non-numeric before submission',
    });
    throw new Error('Invalid current score');
  }
  const userScore = parsedScore;
  const recognizedScore = (() => {
    if (!input.aiReviewData?.score) return undefined;
    const parsed = parseInt(input.aiReviewData.score, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  })();
  const isAnomaly =
    recognizedScore !== undefined
      ? Math.abs(userScore - recognizedScore) > CONSTANTS.ANOMALY_SCORE_DIFF_THRESHOLD
      : false;
  const reportedStatus = normalizeReportedStatus(
    input.aiReviewData?.condition,
    input.selectedLocation?.status,
  );

  const notes = [
    input.aiReviewData?.notes,
    input.gpsSourceType !== 'live' ? `[GPS: ${input.gpsSourceType}]` : null,
  ]
    .filter(Boolean)
    .join(' ') || null;

  return {
    txId: input.draftTxId,
    locationId: input.selectedLocation.id,
    driverId: input.currentDriver.id,
    currentScore: clampCollectionAmount('currentScore', input.currentScore),
    expenses: expenseValue,
    tip: clampCollectionAmount('tip', input.tip),
    startupDebtDeduction: input.calculations.startupDebtDeduction.toNumber(),
    isOwnerRetaining: input.isOwnerRetaining,
    ownerRetention:
      input.ownerRetention !== '' ? clampCollectionAmount('ownerRetention', input.ownerRetention) : null,
    coinExchange: clampCollectionAmount('coinExchange', input.coinExchange),
    gps:
      input.resolvedGps.lat === 0 && input.resolvedGps.lng === 0
        ? null
        : input.resolvedGps,
    photoUrl: input.photoData || null,
    aiScore: recognizedScore ?? null,
    anomalyFlag: isAnomaly,
    notes,
    expenseType: input.expenseType ?? null,
    expenseCategory: input.expenseCategory ?? null,
    expenseDescription: input.expenseDescription,
    reportedStatus,
  };
}

async function fallbackToOffline(
  input: OrchestrateCollectionSubmissionInput,
  rawInput: CollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps,
  reason: string | null,
): Promise<OrchestratedCollectionSubmissionResult> {
  const offlineTransaction = buildOfflineTransaction(input, rawInput, deps);
  await enqueueOfflineTransaction(
    offlineTransaction,
    rawInput,
    input,
    reason ?? 'Offline fallback',
    deps,
  );
  return {
    source: 'offline',
    transaction: offlineTransaction,
    fallbackReason: reason,
  };
}

export async function orchestrateCollectionSubmission(
  input: OrchestrateCollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps = defaultDeps,
): Promise<OrchestratedCollectionSubmissionResult> {
  const rawInput = buildCollectionSubmissionInput(input);

  appendCollectionSubmissionAudit({
    timestamp: new Date().toISOString(),
    event: 'submit_attempt',
    txId: input.draftTxId,
    locationId: input.selectedLocation.id,
    locationName: input.selectedLocation.name,
    driverId: input.currentDriver.id,
    currentScoreRaw: input.currentScore,
    resolvedScore: rawInput.currentScore,
    previousScore: input.selectedLocation.lastScore,
    metadata: {
      isOnline: input.isOnline,
      gpsSourceType: input.gpsSourceType,
      reportedStatus: rawInput.reportedStatus,
    },
  });

  if (input.isOnline) {
    const result = await deps.submitCollectionV2(rawInput);
    if (result.success) {
      appendCollectionSubmissionAudit({
        timestamp: new Date().toISOString(),
        event: result.idempotentReplay ? 'submit_server_replay' : 'submit_server_success',
        txId: result.transaction.id,
        locationId: result.transaction.locationId,
        locationName: result.transaction.locationName,
        driverId: result.transaction.driverId,
        currentScoreRaw: input.currentScore,
        resolvedScore: result.transaction.currentScore,
        previousScore: result.transaction.previousScore,
        source: 'server',
        metadata: {
          paymentStatus: result.transaction.paymentStatus,
          approvalStatus: result.transaction.approvalStatus,
          isOwnerRetaining: result.transaction.isOwnerRetaining,
        },
      });
      return {
        source: 'server',
        transaction: result.transaction,
        fallbackReason: null,
      };
    }

    const fallbackError = isFailure(result)
      ? result.error
      : 'Unknown submission failure';
    deps.logger.warn(
      isFailure(result) && result.kind === 'evidence'
        ? '[collectionSubmissionOrchestrator] submit_collection_v2 failed with evidence error:'
        : '[collectionSubmissionOrchestrator] submit_collection_v2 failed, falling back to local path:',
      fallbackError,
    );
    appendCollectionSubmissionAudit({
      timestamp: new Date().toISOString(),
      event: 'submit_server_failure',
      txId: input.draftTxId,
      locationId: input.selectedLocation.id,
      locationName: input.selectedLocation.name,
      driverId: input.currentDriver.id,
      currentScoreRaw: input.currentScore,
      resolvedScore: rawInput.currentScore,
      previousScore: input.selectedLocation.lastScore,
      reason: fallbackError,
      metadata: {
        fallback:
          isFailure(result) && result.kind === 'evidence'
            ? 'blocked_evidence'
            : 'offline_queue',
        kind: isFailure(result) ? result.kind : undefined,
      },
    });

    if (isFailure(result) && result.kind === 'evidence') {
      throw new Error(fallbackError);
    }

    return await fallbackToOffline(input, rawInput, deps, fallbackError);
  }

  return await fallbackToOffline(input, rawInput, deps, null);
}
