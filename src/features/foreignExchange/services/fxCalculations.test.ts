import { describe, expect, it } from 'vitest';
import { calculateRealizedFxGainLoss, calculateUnrealizedFxGainLoss, convertAmount, round2 } from './fxCalculations';

describe('round2', () => {
  it('rounds to two decimal places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1);
    expect(round2(18499.999)).toBe(18500);
  });
});

describe('convertAmount', () => {
  it('multiplies amount by rate and rounds to cents', () => {
    expect(convertAmount(1000, 18)).toBe(18000);
    expect(convertAmount(100, 18.555)).toBe(1855.5);
  });
});

describe('calculateRealizedFxGainLoss', () => {
  it('USD 1000 recognized at 18.00, settled at 18.50: an ASSET gains R500', () => {
    expect(calculateRealizedFxGainLoss(1000, 18.0, 18.5, 'asset')).toBe(500);
  });

  it('USD 1000 recognized at 18.00, settled at 18.50: a LIABILITY loses R500', () => {
    expect(calculateRealizedFxGainLoss(1000, 18.0, 18.5, 'liability')).toBe(-500);
  });

  it('a falling rate flips the result: an ASSET loses when the rate drops', () => {
    expect(calculateRealizedFxGainLoss(1000, 18.5, 18.0, 'asset')).toBe(-500);
  });

  it('a falling rate flips the result: a LIABILITY gains when the rate drops', () => {
    expect(calculateRealizedFxGainLoss(1000, 18.5, 18.0, 'liability')).toBe(500);
  });

  it('is zero when the rate does not move', () => {
    expect(calculateRealizedFxGainLoss(1000, 18.0, 18.0, 'asset')).toBe(0);
    expect(calculateRealizedFxGainLoss(1000, 18.0, 18.0, 'liability')).toBe(0);
  });

  it('rounds the result to cents (333.33 * (18.222 - 18.111) = 36.99963 -> 37.00)', () => {
    expect(calculateRealizedFxGainLoss(333.33, 18.111, 18.222, 'asset')).toBe(37);
  });
});

describe('calculateUnrealizedFxGainLoss', () => {
  it('USD 1000 open balance, originally recognized at 18.00, revalued at 18.50: an ASSET has an unrealized R500 gain', () => {
    expect(calculateUnrealizedFxGainLoss(1000, 18.0, 18.5, 'asset')).toBe(500);
  });

  it('USD 1000 open balance, originally recognized at 18.00, revalued at 18.50: a LIABILITY has an unrealized R500 loss', () => {
    expect(calculateUnrealizedFxGainLoss(1000, 18.0, 18.5, 'liability')).toBe(-500);
  });

  it('shares the same sign convention as the realized calculation for the same inputs', () => {
    const realizedAsset = calculateRealizedFxGainLoss(2500, 19.0, 19.25, 'asset');
    const unrealizedAsset = calculateUnrealizedFxGainLoss(2500, 19.0, 19.25, 'asset');
    expect(unrealizedAsset).toBe(realizedAsset);

    const realizedLiability = calculateRealizedFxGainLoss(2500, 19.0, 19.25, 'liability');
    const unrealizedLiability = calculateUnrealizedFxGainLoss(2500, 19.0, 19.25, 'liability');
    expect(unrealizedLiability).toBe(realizedLiability);
    expect(unrealizedLiability).toBe(-unrealizedAsset);
  });
});
