import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Money, registerCurrency } from '../utils/money';

describe('Money', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects invalid factory inputs', () => {
    expect(() => Money.fromSubunit(1n, 'NOPE')).toThrow('Unknown currency');
    expect(() => Money.fromDecimal('   ', 'TZS')).toThrow('empty amount');
    expect(() => Money.fromDecimal('abc', 'TZS')).toThrow('Invalid decimal amount');
    expect(() => Money.tzs(1.5)).toThrow('TZS amounts must be integers');
  });

  it('enforces currency-safe comparisons and arithmetic', () => {
    const tzs = Money.tzs(100);
    const usd = Money.fromDecimal('1.00', 'USD');

    expect(() => tzs.add(usd)).toThrow('Currency mismatch');
    expect(() => tzs.equals(usd)).toThrow('Currency mismatch');
  });

  it('supports decimal currencies and stable serialization helpers', () => {
    registerCurrency({ code: 'POINTS', decimals: 3, symbol: 'pt' });

    const negativeUsd = Money.fromDTO({ amount: '-1.05', currency: 'USD' });
    const points = Money.fromDecimal('12.3459', 'POINTS');

    expect(negativeUsd.toSubunit()).toBe(-105n);
    expect(negativeUsd.toDecimal()).toBe('-1.05');
    expect(negativeUsd.toJSON()).toEqual({ amount: '-1.05', currency: 'USD' });
    expect(negativeUsd.toString()).toBe('-1.05 USD');
    expect(negativeUsd.valueOf()).toBe('-105:USD');
    expect(points.toDecimal()).toBe('12.345');
    expect(points.getCurrencyConfig()).toMatchObject({ code: 'POINTS', decimals: 3 });
  });

  it('rounds multiplication and division with explicit modes', () => {
    expect(Money.tzs(10).multiply('0.25').toNumber()).toBe(2);
    expect(Money.tzs(10).divide(4, 'trunc').toNumber()).toBe(2);
    expect(Money.tzs(10).divide('4', 'floor').toNumber()).toBe(2);
    expect(Money.tzs(10).divide(4, 'ceil').toNumber()).toBe(3);
    expect(Money.tzs(11).divide(4, 'round').toNumber()).toBe(3);
    expect(Money.tzs(9).divide(4, 'round').toNumber()).toBe(2);
    expect(Money.tzs(14).divide(4, 'round').toNumber()).toBe(4);
    expect(Money.tzs(-10).divide(4, 'floor').toNumber()).toBe(-3);
    expect(Money.tzs(-10).divide(4, 'ceil').toNumber()).toBe(-2);
    expect(Money.tzs(-14).divide(4, 'round').toNumber()).toBe(-4);
    expect(() => Money.tzs(1).divide(0)).toThrow('Division by zero');
  });

  it('reports precision risk when converting unsafe subunits to number', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unsafe = Money.fromSubunit(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 'TZS');

    expect(unsafe.toNumber()).toBe(Number.MAX_SAFE_INTEGER + 1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('precision loss'));
  });
});
