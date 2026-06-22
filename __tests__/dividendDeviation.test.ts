import { describe, expect, it } from '@jest/globals';

import {
  classifyDividendDeviation,
  formatDeviationPercent,
} from '../services/dividendDeviation';

describe('classifyDividendDeviation', () => {
  it('treats an exact match as normal', () => {
    const d = classifyDividendDeviation(1000, 1000);
    expect(d.tier).toBe('normal');
    expect(d.ratio).toBe(0);
  });

  it('treats deviation up to and including 10% as normal', () => {
    expect(classifyDividendDeviation(1000, 1100).tier).toBe('normal');
    expect(classifyDividendDeviation(1000, 900).tier).toBe('normal');
  });

  it('flags 10–30% deviation as reminder', () => {
    expect(classifyDividendDeviation(1000, 1200).tier).toBe('reminder');
    expect(classifyDividendDeviation(1000, 750).tier).toBe('reminder');
    // exactly 30% is still reminder
    expect(classifyDividendDeviation(1000, 1300).tier).toBe('reminder');
  });

  it('flags deviation above 30% as review', () => {
    expect(classifyDividendDeviation(1000, 1301).tier).toBe('review');
    expect(classifyDividendDeviation(1000, 500).tier).toBe('review');
  });

  it('keeps the sign of the deviation', () => {
    expect(classifyDividendDeviation(1000, 1450).ratio).toBeCloseTo(0.45);
    expect(classifyDividendDeviation(1000, 550).ratio).toBeCloseTo(-0.45);
  });

  it('treats money paid against a zero theoretical as max deviation', () => {
    const d = classifyDividendDeviation(0, 500);
    expect(d.tier).toBe('review');
    expect(d.ratio).toBe(Number.POSITIVE_INFINITY);
  });

  it('treats zero-on-zero as normal', () => {
    expect(classifyDividendDeviation(0, 0).tier).toBe('normal');
  });

  it('guards against non-finite inputs', () => {
    expect(classifyDividendDeviation(NaN, NaN).tier).toBe('normal');
  });
});

describe('formatDeviationPercent', () => {
  it('prefixes positive deviations with +', () => {
    expect(formatDeviationPercent(0.45)).toBe('+45%');
  });

  it('keeps negative deviations signed', () => {
    expect(formatDeviationPercent(-0.12)).toBe('-12%');
  });

  it('renders infinity as ∞%', () => {
    expect(formatDeviationPercent(Number.POSITIVE_INFINITY)).toBe('∞%');
  });
});
