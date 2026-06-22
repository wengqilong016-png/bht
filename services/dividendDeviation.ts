/**
 * Single source of truth for classifying how far a driver's hand-entered
 * dividend (店主分红 / 开机分红) deviates from the theoretical dividend
 * (revenue × commission rate).
 *
 * Used by:
 *  - the driver collection UI (live badge while editing the amount),
 *  - the submission orchestrator (flag the transaction for admin review),
 *  - the admin approval queue (label + severity).
 *
 * Tiers (by absolute deviation magnitude):
 *  - normal:   ≤ 10%  → credited as usual, no notification
 *  - reminder: 10–30% → surfaced to admin as a reminder
 *  - review:   > 30%  → surfaced to admin as requiring approval
 */

export type DividendDeviationTier = 'normal' | 'reminder' | 'review';

export const DIVIDEND_DEVIATION_THRESHOLDS = {
  /** Up to and including this magnitude is "normal". */
  reminder: 0.1,
  /** Above this magnitude requires admin approval. */
  review: 0.3,
} as const;

export interface DividendDeviation {
  tier: DividendDeviationTier;
  /** Signed ratio: (actual - theoretical) / theoretical. Positive = paid more than theoretical. */
  ratio: number;
  /** Absolute deviation magnitude used for tier classification. */
  magnitude: number;
  theoretical: number;
  actual: number;
}

export function classifyDividendDeviation(theoretical: number, actual: number): DividendDeviation {
  const safeTheoretical = Number.isFinite(theoretical) ? theoretical : 0;
  const safeActual = Number.isFinite(actual) ? actual : 0;

  let ratio: number;
  if (safeTheoretical > 0) {
    ratio = (safeActual - safeTheoretical) / safeTheoretical;
  } else if (safeActual > 0) {
    // No theoretical basis to compare against, but money was entered → max deviation.
    ratio = Number.POSITIVE_INFINITY;
  } else {
    ratio = 0;
  }

  const magnitude = Math.abs(ratio);
  const tier: DividendDeviationTier =
    magnitude > DIVIDEND_DEVIATION_THRESHOLDS.review
      ? 'review'
      : magnitude > DIVIDEND_DEVIATION_THRESHOLDS.reminder
        ? 'reminder'
        : 'normal';

  return { tier, ratio, magnitude, theoretical: safeTheoretical, actual: safeActual };
}

/** e.g. +45%, -12%, ∞%. */
export function formatDeviationPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '∞%';
  const pct = Math.round(ratio * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

interface DividendTierLabels {
  badge: string;
  /** Short note recorded on the transaction so admins see why it was flagged. */
  note: (percent: string) => string;
}

/** Bilingual labels for the three tiers (zh = admin/Chinese, sw = driver/English). */
export const DIVIDEND_TIER_LABELS: Record<'zh' | 'sw', Record<DividendDeviationTier, DividendTierLabels>> = {
  zh: {
    normal: { badge: '正常', note: () => '' },
    reminder: { badge: '提醒', note: (p) => `[分红偏差 ${p} · 提醒]` },
    review: { badge: '需审批', note: (p) => `[分红偏差 ${p} · 需审批]` },
  },
  sw: {
    normal: { badge: 'Normal', note: () => '' },
    reminder: { badge: 'Notice', note: (p) => `[Dividend deviation ${p} · notice]` },
    review: { badge: 'Approval', note: (p) => `[Dividend deviation ${p} · approval]` },
  },
};
