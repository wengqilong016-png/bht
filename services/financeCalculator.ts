import { supabase } from '../supabaseClient';
import { CONSTANTS, Location } from '../types';
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

/**
 * Parse a form field string into a TZS Money amount.
 * Replaces the lossy parseAmount() — all string→money conversion goes through Money.tzs().
 */
function parseTzs(value: string): Money {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return Money.zero('TZS');
  try {
    return Money.tzs(normalized);
  } catch {
    return Money.zero('TZS');
  }
}

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
    currentScore: Math.min(
      Math.floor(parseTzs(input.currentScore).toNumber()),
      CONSTANTS.MAX_REASONABLE_SCORE,
    ),
    expenses: parseTzs(input.expenses),
    tip: parseTzs(input.tip),
    startupDebtDeductionRequest: parseTzs(input.startupDebtDeduction),
    ownerRetention: input.ownerRetention !== '' ? parseTzs(input.ownerRetention) : null,
    initialFloat: Money.tzs(input.initialFloat || 0),
    coinExchange: parseTzs(input.coinExchange),
  };
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
      console.warn(
        '[FinancePreview] RPC version mismatch, falling back to local',
        error,
      );
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
