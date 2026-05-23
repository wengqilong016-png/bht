import { CONSTANTS } from '../types';

export type CollectionAmountField =
  | 'currentScore'
  | 'expenses'
  | 'coinExchange'
  | 'ownerRetention'
  | 'tip'
  | 'startupDebtDeduction';

export interface CollectionAmountWarning {
  field: CollectionAmountField;
  max: number;
  rawValue: string;
  value: number;
}

export const COLLECTION_AMOUNT_LIMITS: Record<CollectionAmountField, number> = {
  currentScore: CONSTANTS.MAX_REASONABLE_SCORE,
  expenses: CONSTANTS.MAX_EXPENSES,
  coinExchange: CONSTANTS.MAX_COIN_EXCHANGE,
  ownerRetention: CONSTANTS.MAX_OWNER_RETENTION,
  tip: CONSTANTS.MAX_TIP,
  startupDebtDeduction: CONSTANTS.MAX_STARTUP_DEBT_DEDUCTION,
};

const ABSOLUTE_VALUE_FIELDS = new Set<CollectionAmountField>(['expenses', 'tip']);

function parseNumericInput(raw: string): number {
  const normalized = raw.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clampCollectionAmount(
  field: CollectionAmountField,
  rawValue: string,
): number {
  const parsed = parseNumericInput(rawValue);
  const normalizedBase = ABSOLUTE_VALUE_FIELDS.has(field)
    ? Math.abs(parsed)
    : parsed;
  const normalized = field === 'currentScore'
    ? Math.floor(normalizedBase)
    : normalizedBase;
  return Math.min(Math.max(normalized, 0), COLLECTION_AMOUNT_LIMITS[field]);
}

export function parseCollectionAmountForWarning(
  field: CollectionAmountField,
  rawValue: string,
): number {
  const parsed = parseNumericInput(rawValue);
  const normalizedBase = ABSOLUTE_VALUE_FIELDS.has(field)
    ? Math.abs(parsed)
    : parsed;
  return field === 'currentScore'
    ? Math.floor(normalizedBase)
    : normalizedBase;
}

export function getCollectionAmountWarnings(values: Partial<Record<CollectionAmountField, string>>): CollectionAmountWarning[] {
  return Object.entries(values).flatMap(([field, rawValue]) => {
    if (typeof rawValue !== 'string' || rawValue.trim() === '') return [];
    const key = field as CollectionAmountField;
    const normalized = parseCollectionAmountForWarning(key, rawValue);
    if (!Number.isFinite(normalized) || normalized <= COLLECTION_AMOUNT_LIMITS[key]) {
      return [];
    }
    return [{
      field: key,
      max: COLLECTION_AMOUNT_LIMITS[key],
      rawValue,
      value: normalized,
    }];
  });
}
