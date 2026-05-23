import { supabase } from '../supabaseClient';
import { CONSTANTS, Location } from '../types';
import { clampCollectionAmount } from '../utils/collectionAmountLimits';
import { Money } from '../utils/money';

export type FinanceCalculationSource = 'local' | 'server';

/** Money-typed finance result — monetary fields use Money, counts stay as number. */
export interface FinanceCalculationResult {
  diff: Money;              // coin count difference wrapped as Money
  revenue: Money;
  commission: Money;
  finalRetention: Money;
  startupDebtDeduction: Money;
  netPayable: Money;
  remainingCoins: Money;    // coin count wrapped as Money
  isCoinStockNegative: boolean;
  source: FinanceCalculationSource;
}

export interface CollectionFinanceInput {
  selectedLocation: Location | null | undefined;
  currentScore: string;
  expenses: string;
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  startupDebtDeduction: string;
  initialFloat?: number;
}

/** Internal normalized input — all Money-typed. */
interface NormalizedFinanceInput {
  currentScore: number;       // coin count (not money)
  expenses: Money;
  tip: Money;
  startupDebtDeductionRequest: Money;
  ownerRetention: Money | null;
  initialFloat: Money;
  coinExchange: Money;
}

type FinanceRpcPayload = Partial<Record<
  'diff' | 'revenue' | 'commission' | 'finalRetention' | 'startupDebtDeduction' | 'netPayable',
  number
>>;

const EMPTY_RESULT: FinanceCalculationResult = {
  diff: Money.zero('TZS'),
  revenue: Money.zero('TZS'),
  commission: Money.zero('TZS'),
  finalRetention: Money.zero('TZS'),
  startupDebtDeduction: Money.zero('TZS'),
  netPayable: Money.zero('TZS'),
  remainingCoins: Money.zero('TZS'),
  isCoinStockNegative: false,
  source: 'local',
};

function normalizeFinanceInput(input: CollectionFinanceInput): NormalizedFinanceInput {
  return {
    currentScore: clampCollectionAmount('currentScore', input.currentScore),
    expenses: Money.tzs(clampCollectionAmount('expenses', input.expenses)),
    tip: Money.tzs(clampCollectionAmount('tip', input.tip)),
    startupDebtDeductionRequest: Money.tzs(
      clampCollectionAmount('startupDebtDeduction', input.startupDebtDeduction),
    ),
    ownerRetention: input.ownerRetention !== ''
      ? Money.tzs(clampCollectionAmount('ownerRetention', input.ownerRetention))
      : null,
    initialFloat: Money.tzs(input.initialFloat || 0),
    coinExchange: Money.tzs(clampCollectionAmount('coinExchange', input.coinExchange)),
  };
}

function getFinancePreviewRpcWarning(error: unknown, selectedLocation: Location): string {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  const looksLikeSignatureMismatch =
    message.includes('calculate_finance_v2') &&
    (message.includes('function') || message.includes('No function matches'));

  return looksLikeSignatureMismatch
    ? '[FinancePreview] RPC contract mismatch, falling back to local preview'
    : `[FinancePreview] RPC preview unavailable for location ${selectedLocation.id}, falling back to local`;
}

function calculateRemainingCoins(
  initialFloat: Money,
  netPayable: Money,
  coinExchange: Money,
): Money {
  return initialFloat.add(netPayable).subtract(coinExchange);
}

function buildServerFinanceResult(
  payload: FinanceRpcPayload,
  fallback: FinanceCalculationResult,
  normalized: NormalizedFinanceInput,
): FinanceCalculationResult {
  const netPayable = Money.tzs(payload.netPayable ?? fallback.netPayable.toNumber());
  const remainingCoins = calculateRemainingCoins(
    normalized.initialFloat,
    netPayable,
    normalized.coinExchange,
  );

  return {
    diff: Money.tzs(payload.diff ?? fallback.diff.toNumber()),
    revenue: Money.tzs(payload.revenue ?? fallback.revenue.toNumber()),
    commission: Money.tzs(payload.commission ?? fallback.commission.toNumber()),
    finalRetention: Money.tzs(
      payload.finalRetention ?? fallback.finalRetention.toNumber(),
    ),
    startupDebtDeduction: Money.tzs(
      payload.startupDebtDeduction ?? fallback.startupDebtDeduction.toNumber(),
    ),
    netPayable,
    remainingCoins,
    isCoinStockNegative: remainingCoins.isNegative(),
    source: 'server',
  };
}

export function calculateCollectionFinanceLocal(
  input: CollectionFinanceInput,
): FinanceCalculationResult {
  const { selectedLocation } = input;
  if (!selectedLocation) return { ...EMPTY_RESULT };
  const normalized = normalizeFinanceInput(input);

  // diff = max(0, currentScore - lastScore) coins
  const lastScore = selectedLocation.lastScore;
  const diffCoins = Math.max(0, normalized.currentScore - lastScore);
  const diff = Money.tzs(diffCoins);

  // revenue = diff × COIN_VALUE_TZS
  const revenue = diff.multiply(CONSTANTS.COIN_VALUE_TZS);

  // commission = floor(revenue × commissionRate)
  const commissionRate = selectedLocation.commissionRate ?? CONSTANTS.DEFAULT_PROFIT_SHARE;
  const commission = revenue.multiply(commissionRate, 'floor');

  // finalRetention
  const finalRetention = normalized.ownerRetention ?? commission;

  // remainingStartupDebt
  const remainingStartupDebt = Money.tzs(
    Math.max(0, selectedLocation.remainingStartupDebt || 0),
  );

  // availableAfterCoreDeductions = max(0, revenue - finalRetention - expenses - tip)
  const availableAfterCoreDeductions = revenue
    .subtract(finalRetention)
    .subtract(normalized.expenses.abs())
    .subtract(normalized.tip.abs());

  // startupDebtDeduction = min(request, remainingStartupDebt)
  const startupDebtDeduction = normalized.startupDebtDeductionRequest
    .isLessThan(remainingStartupDebt)
    ? normalized.startupDebtDeductionRequest
    : remainingStartupDebt;

  // netPayable = max(0, availableAfterCoreDeductions + startupDebtDeduction)
  const netPayableMoney = availableAfterCoreDeductions.add(startupDebtDeduction);
  const netPayable = netPayableMoney.isNegative()
    ? Money.zero('TZS')
    : netPayableMoney;

  const remainingCoins = calculateRemainingCoins(
    normalized.initialFloat,
    netPayable,
    normalized.coinExchange,
  );

  return {
    diff,
    revenue,
    commission,
    finalRetention,
    startupDebtDeduction,
    netPayable,
    remainingCoins,
    isCoinStockNegative: remainingCoins.isNegative(),
    source: 'local',
  };
}

export async function calculateCollectionFinancePreview(
  input: CollectionFinanceInput,
): Promise<FinanceCalculationResult> {
  const fallback = calculateCollectionFinanceLocal(input);
  const { selectedLocation } = input;
  const normalized = normalizeFinanceInput(input);

  if (!selectedLocation || !input.currentScore.trim()) {
    return fallback;
  }

  try {
    if (!supabase) {
      return fallback;
    }
    const { data, error } = await supabase.rpc('calculate_finance_v2', {
      p_current_score: normalized.currentScore,
      p_previous_score: selectedLocation.lastScore,
      p_commission_rate:
        selectedLocation.commissionRate ?? CONSTANTS.DEFAULT_PROFIT_SHARE,
      p_expenses: normalized.expenses.toNumber(),
      p_tip: normalized.tip.toNumber(),
      p_is_owner_retaining: input.isOwnerRetaining,
      p_owner_retention: normalized.ownerRetention?.toNumber() ?? null,
      p_startup_debt_deduction_request: Math.max(
        0,
        normalized.startupDebtDeductionRequest.toNumber(),
      ),
      p_startup_debt_balance: Math.max(
        0,
        selectedLocation.remainingStartupDebt || 0,
      ),
    }).abortSignal(AbortSignal.timeout(10_000));

    if (error || !data) {
      console.warn(getFinancePreviewRpcWarning(error, selectedLocation), {
        error,
        locationId: selectedLocation.id,
        requestedParamCount: 9,
      });
      return fallback;
    }

    return buildServerFinanceResult(
      data as FinanceRpcPayload,
      fallback,
      normalized,
    );
  } catch (error) {
    console.warn('Failed to calculate finance preview from server RPC.', error);
    return fallback;
  }
}
