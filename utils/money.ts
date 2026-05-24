/**
 * Money — immutable value object for monetary amounts.
 *
 * Backed by native BigInt, per ADR-001.
 * Internal representation: subunit (smallest currency unit).
 * TZS = 0 decimal places → 1 TZS = 1 subunit.
 *
 * Design invariants:
 * - Immutable: all arithmetic returns new Money instances.
 * - Currency-safe: operations on mismatched currencies throw.
 * - JSON-safe: toJSON() returns amount as string, never number.
 * - Multiplication/division require explicit rounding mode.
 */

// ── types ─────────────────────────────────────────────────────

export interface CurrencyConfig {
  readonly code: string;
  readonly decimals: number;
  readonly symbol: string;
}

export type RoundingMode = 'floor' | 'ceil' | 'round' | 'trunc';

export interface MoneyDTO {
  readonly amount: string;
  readonly currency: string;
}

// ── built-in currencies ──────────────────────────────────────

export const CURRENCIES: Record<string, CurrencyConfig> = {
  TZS: { code: 'TZS', decimals: 0, symbol: 'TSh' },
  USD: { code: 'USD', decimals: 2, symbol: '$' },
};

// ── registry ─────────────────────────────────────────────────

export function registerCurrency(config: CurrencyConfig): void {
  CURRENCIES[config.code] = config;
}

function getCurrency(code: string): CurrencyConfig {
  const c = CURRENCIES[code];
  if (!c) throw new Error(`Unknown currency: ${code}`);
  return c;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

function subunitFactor(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function parseDecimal(s: string, decimals: number): bigint {
  const trimmed = s.trim();
  if (!trimmed) throw new Error('Cannot parse empty amount string');

  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;

  if (!/^\d+(\.\d*)?$/.test(abs)) {
    throw new Error(`Invalid decimal amount: "${s}"`);
  }

  const [intPart, fracPart = ''] = abs.split('.');
  const fracPadded = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const subunitStr = intPart + fracPadded;
  const subunit = BigInt(subunitStr);
  return negative ? -subunit : subunit;
}

/**
 * Convert a number to a decimal string WITHOUT scientific notation.
 * (1e-5).toString() = "1e-5", but Number.prototype.toLocaleString with
 * fixed options always produces a plain decimal form.
 */
function numberToDecimalString(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Cannot convert non-finite number: ${n}`);
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
}

// ── Money class ───────────────────────────────────────────────

export class Money {
  public readonly subunitAmount: bigint;
  public readonly currency: string;

  private constructor(subunitAmount: bigint, currency: string) {
    this.subunitAmount = subunitAmount;
    this.currency = currency;
  }

  // ── factories ────────────────────────────────────────────

  static fromSubunit(amount: bigint, currency: string): Money {
    getCurrency(currency);
    return new Money(amount, currency);
  }

  static fromDecimal(amount: string, currency: string): Money {
    const cfg = getCurrency(currency);
    const subunit = parseDecimal(amount, cfg.decimals);
    return new Money(subunit, currency);
  }

  static fromDTO(dto: MoneyDTO): Money {
    return Money.fromDecimal(dto.amount, dto.currency);
  }

  static zero(currency: string): Money {
    return new Money(0n, currency);
  }

  /**
   * BHT-specific: create a TZS Money from a number or string.
   * This is the primary factory for the BHT project — all monetary
   * amounts are in Tanzanian Shillings (0 decimal places).
   *
   * Prefer string input to avoid floating-point precision loss:
   *   Money.tzs('1500')  // good
   *   Money.tzs(1500)    // ok for integers, but beware large numbers
   */
  static tzs(amount: number | string): Money {
    if (typeof amount === 'number') {
      if (!Number.isInteger(amount)) {
        throw new Error(
          `TZS amounts must be integers, got: ${amount}. ` +
          'TZS has 0 decimal places — fractional amounts cannot be represented.',
        );
      }
      return new Money(BigInt(amount), 'TZS');
    }
    return Money.fromDecimal(amount, 'TZS');
  }

  // ── arithmetic ───────────────────────────────────────────

  add(other: Money): Money {
    assertSameCurrency(this, other);
    return new Money(this.subunitAmount + other.subunitAmount, this.currency);
  }

  subtract(other: Money): Money {
    assertSameCurrency(this, other);
    return new Money(this.subunitAmount - other.subunitAmount, this.currency);
  }

  multiply(factor: number | string, mode: RoundingMode = 'round'): Money {
    const factorStr = typeof factor === 'number' ? numberToDecimalString(factor) : factor;
    const FACTOR_DECIMALS = 6;
    const factorSubunit = parseDecimal(factorStr, FACTOR_DECIMALS);
    const factorDenom = subunitFactor(FACTOR_DECIMALS);

    const product = this.subunitAmount * factorSubunit;
    const result = roundBigInt(product, factorDenom, mode);
    return new Money(result, this.currency);
  }

  divide(divisor: number | string, mode: RoundingMode = 'round'): Money {
    const divisorStr =
      typeof divisor === 'number' ? numberToDecimalString(divisor) : divisor;
    const DIVISOR_DECIMALS = 6;
    const divisorSubunit = parseDecimal(divisorStr, DIVISOR_DECIMALS);

    if (divisorSubunit === 0n) {
      throw new Error('Division by zero');
    }

    const scaled = this.subunitAmount * subunitFactor(DIVISOR_DECIMALS);
    const result = roundBigInt(scaled, divisorSubunit, mode);
    return new Money(result, this.currency);
  }

  negate(): Money {
    return new Money(-this.subunitAmount, this.currency);
  }

  abs(): Money {
    if (this.subunitAmount < 0n) {
      return this.negate();
    }
    return this;
  }

  // ── comparison ───────────────────────────────────────────

  equals(other: Money): boolean {
    assertSameCurrency(this, other);
    return this.subunitAmount === other.subunitAmount;
  }

  isGreaterThan(other: Money): boolean {
    assertSameCurrency(this, other);
    return this.subunitAmount > other.subunitAmount;
  }

  isLessThan(other: Money): boolean {
    assertSameCurrency(this, other);
    return this.subunitAmount < other.subunitAmount;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    assertSameCurrency(this, other);
    return this.subunitAmount >= other.subunitAmount;
  }

  isLessThanOrEqual(other: Money): boolean {
    assertSameCurrency(this, other);
    return this.subunitAmount <= other.subunitAmount;
  }

  isZero(): boolean {
    return this.subunitAmount === 0n;
  }

  isPositive(): boolean {
    return this.subunitAmount > 0n;
  }

  isNegative(): boolean {
    return this.subunitAmount < 0n;
  }

  // ── conversion ───────────────────────────────────────────

  toSubunit(): bigint {
    return this.subunitAmount;
  }

  toNumber(): number {
    const n = Number(this.subunitAmount);
    if (!Number.isSafeInteger(n)) {
      console.warn(
        `[Money] toNumber() precision loss: ${this.subunitAmount} exceeds ` +
        `Number.MAX_SAFE_INTEGER. Use toSubunit() or toDecimal() instead.`,
      );
    }
    return n;
  }

  toDecimal(): string {
    const cfg = getCurrency(this.currency);
    if (cfg.decimals === 0) return this.subunitAmount.toString();

    const abs = this.subunitAmount < 0n ? -this.subunitAmount : this.subunitAmount;
    const sign = this.subunitAmount < 0n ? '-' : '';
    const str = abs.toString().padStart(cfg.decimals + 1, '0');
    const intPart = str.slice(0, str.length - cfg.decimals) || '0';
    const fracPart = str.slice(str.length - cfg.decimals);
    return `${sign}${intPart}.${fracPart}`;
  }

  toJSON(): MoneyDTO {
    return {
      amount: this.toDecimal(),
      currency: this.currency,
    };
  }

  getCurrencyConfig(): CurrencyConfig {
    return getCurrency(this.currency);
  }

  format(locale?: string): string {
    const cfg = getCurrency(this.currency);
    try {
      const unitAmount = Number(this.subunitAmount) / 10 ** cfg.decimals;
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency,
        minimumFractionDigits: cfg.decimals,
        maximumFractionDigits: cfg.decimals,
      }).format(unitAmount);
    } catch {
      const decimal = this.toDecimal();
      return `${cfg.symbol} ${decimal}`;
    }
  }

  toString(): string {
    return `${this.toDecimal()} ${this.currency}`;
  }

  valueOf(): string {
    return `${this.subunitAmount}:${this.currency}`;
  }
}

// ── internal helpers ─────────────────────────────────────────

function roundBigInt(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  if (remainder === 0n) return quotient;

  const halfDenom = denominator >> 1n;
  const isNegative = numerator < 0n !== denominator < 0n;

  switch (mode) {
    case 'trunc':
      return quotient;
    case 'floor':
      return isNegative ? quotient - 1n : quotient;
    case 'ceil':
      return isNegative ? quotient : quotient + 1n;
    case 'round': {
      const absRem = remainder < 0n ? -remainder : remainder;
      const absHalf = halfDenom < 0n ? -halfDenom : halfDenom;
      if (absRem > absHalf) {
        return isNegative ? quotient - 1n : quotient + 1n;
      }
      if (absRem < absHalf) {
        return quotient;
      }
      // Tie: round to even (banker's rounding).
      if (quotient % 2n === 0n) {
        return quotient;
      }
      return isNegative ? quotient - 1n : quotient + 1n;
    }
  }
}
