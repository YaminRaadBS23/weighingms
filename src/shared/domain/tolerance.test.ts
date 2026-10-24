import { describe, expect, it } from 'vitest';
import type { Quantity } from '../quantity';
import {
  evaluateZone,
  isConfirmable,
  surplus,
  toleranceBand,
  type ToleranceSpec,
} from './tolerance';

const g = (value: string): Quantity => ({ value, unit: 'g' });
const kg = (value: string): Quantity => ({ value, unit: 'kg' });

/** Yellow RGB: 94.0 g ±0.5 g → band 93.5 – 94.5 (workbook Step 22). */
const yellow: ToleranceSpec = { target: g('94.0'), tolerance: g('0.5') };
/** Sodium Sulphate: 24.000 kg ±0.120 kg → band 23.880 – 24.120. */
const sulphate: ToleranceSpec = { target: kg('24.000'), tolerance: kg('0.120') };

describe('toleranceBand', () => {
  it('Yellow RGB: 93.5 – 94.5 g, in the target’s unit', () => {
    expect(toleranceBand(yellow)).toEqual({ lower: g('93.5'), upper: g('94.5') });
  });
  it('Sodium Sulphate: 23.88 – 24.12 kg', () => {
    expect(toleranceBand(sulphate)).toEqual({ lower: kg('23.88'), upper: kg('24.12') });
  });
  it('a tolerance in another unit is converted exactly', () => {
    expect(toleranceBand({ target: kg('1.000'), tolerance: g('2.5') })).toEqual({
      lower: kg('0.9975'),
      upper: kg('1.0025'),
    });
  });
});

describe('evaluateZone — Yellow RGB 94.0 g ±0.5 g (workbook Step 22)', () => {
  it.each([
    ['93.4', 'NEAR', false, 'below tolerance: cannot confirm'],
    ['93.49', 'NEAR', false, 'just below the boundary'],
    ['93.5', 'OK', true, 'lower boundary: can confirm'],
    ['94.0', 'OK', true, 'target: can confirm'],
    ['94.5', 'OK', true, 'upper boundary: can confirm'],
    ['94.51', 'OVER', false, 'just above the boundary'],
    ['94.6', 'OVER', false, 'over: cannot confirm'],
  ])('%s g → %s (confirmable: %s) — %s', (weight, zone, confirmable) => {
    const z = evaluateZone(g(weight), yellow);
    expect(z).toBe(zone);
    expect(isConfirmable(z)).toBe(confirmable);
  });

  it.each([
    ['84.6', 'NEAR'],
    ['84.59', 'UNDER'],
    ['84.5', 'UNDER'],
    ['50.0', 'UNDER'],
    ['0.0', 'UNDER'],
    ['0', 'UNDER'],
    ['-1.0', 'UNDER'],
    ['-0.1', 'UNDER'],
  ])('%s g → %s (90 % of the target is 84.6 g; zero and negative are UNDER)', (weight, zone) => {
    expect(evaluateZone(g(weight), yellow)).toBe(zone);
  });
});

describe('evaluateZone — Sodium Sulphate 24.000 kg ±0.120 kg', () => {
  it.each([
    ['23.879', 'NEAR'],
    ['23.880', 'OK'],
    ['24.000', 'OK'],
    ['24.120', 'OK'],
    ['24.121', 'OVER'],
    ['21.600', 'NEAR'],
    ['21.599', 'UNDER'],
    ['0.000', 'UNDER'],
  ])('%s kg → %s', (weight, zone) => {
    expect(evaluateZone(kg(weight), sulphate)).toBe(zone);
  });
});

describe('evaluateZone — units and exactness', () => {
  it('a weight in the other unit is converted exactly (0.0935 kg = 93.5 g → OK; 0.0934 kg → NEAR)', () => {
    expect(evaluateZone(kg('0.0935'), yellow)).toBe('OK');
    expect(evaluateZone(kg('0.0934'), yellow)).toBe('NEAR');
    expect(evaluateZone(kg('0.0946'), yellow)).toBe('OVER');
  });
  it('a gram reading for a kilogram component (24 120.0 g → OK, 24 121.0 g → OVER)', () => {
    expect(evaluateZone(g('24120.0'), sulphate)).toBe('OK');
    expect(evaluateZone(g('24121.0'), sulphate)).toBe('OVER');
  });
  it('has no floating-point artefacts at the limits (0.1 + 0.2 style sums)', () => {
    const spec: ToleranceSpec = { target: g('0.2'), tolerance: g('0.1') };
    expect(toleranceBand(spec).upper).toEqual(g('0.3'));
    expect(evaluateZone(g('0.3'), spec)).toBe('OK'); // 0.1 + 0.2 === 0.30000000000000004 in floats
    expect(evaluateZone(g('0.31'), spec)).toBe('OVER');
  });
  it('only the OK zone is confirmable', () => {
    expect(['UNDER', 'NEAR', 'OK', 'OVER'].filter((z) => isConfirmable(z as 'OK'))).toEqual(['OK']);
  });
});

describe('surplus (FR-20)', () => {
  it('96.4 g for Yellow RGB → +2.4 g and +2.6 %', () => {
    expect(surplus(g('96.4'), yellow)).toEqual({ amount: g('2.4'), percent: '2.6' });
  });
  it('the percentage is rounded half up to one decimal (+2.553 % → 2.6, +0.05 % → 0.1)', () => {
    expect(surplus(g('96.4'), yellow).percent).toBe('2.6');
    expect(surplus(g('94.047'), yellow).percent).toBe('0.1');
  });
  it('works in kg and across units', () => {
    expect(surplus(kg('24.600'), sulphate)).toEqual({ amount: kg('0.6'), percent: '2.5' });
    expect(surplus(g('96.4'), { target: kg('0.094'), tolerance: kg('0.0005') }).amount).toEqual(
      kg('0.0024'),
    );
  });
  it('is negative below the target (callers show it only for OVER weights)', () => {
    expect(surplus(g('90.0'), yellow)).toEqual({ amount: g('-4'), percent: '-4.3' });
  });
});
