import { describe, expect, it } from 'vitest';
import type { Quantity } from '../quantity';
import {
  calibrationState,
  displayState,
  fitsCapacity,
  isScaleUsable,
  scaleRequirement,
  selectScale,
  type ScaleCandidate,
} from './scale-selection';

const NOW = new Date('2026-10-24T09:00:00Z');
const FUTURE = '2027-03-31T00:00:00Z';
const PAST = '2026-10-23T00:00:00Z';

const s3: ScaleCandidate = {
  scaleId: 'scale-3kg',
  capacity: { value: '3', unit: 'kg' },
  calibrationDueAt: FUTURE,
  connected: true,
};
const s32: ScaleCandidate = {
  scaleId: 'scale-32kg',
  capacity: { value: '32', unit: 'kg' },
  calibrationDueAt: FUTURE,
  connected: true,
};
const q = (value: string, unit: 'g' | 'kg'): Quantity => ({ value, unit });
const pick = (r: Quantity, scales: ScaleCandidate[]) =>
  selectScale(r, scales, NOW)?.scaleId ?? null;

describe('scaleRequirement', () => {
  it('adds target, tolerance and container tare exactly (Blue: 1240.0 + 6.0 + 214.0 g)', () => {
    expect(scaleRequirement(q('1240.0', 'g'), q('6.0', 'g'), q('214.0', 'g'))).toEqual(
      q('1460', 'g'),
    );
  });
  it('converts units: Sodium Sulphate 24.000 kg + 0.120 kg + 1.850 kg = 25.97 kg', () => {
    expect(scaleRequirement(q('24.000', 'kg'), q('0.120', 'kg'), q('1.850', 'kg'))).toEqual(
      q('25.97', 'kg'),
    );
  });
  it('mixes g and kg without floating-point error (0.1 g + 0.2 g container in kg)', () => {
    expect(scaleRequirement(q('0.1', 'g'), q('0.1', 'g'), q('0.0002', 'kg'))).toEqual(
      q('0.4', 'g'),
    );
  });
  it('works without a container', () => {
    expect(scaleRequirement(q('94.0', 'g'), q('0.5', 'g'))).toEqual(q('94.5', 'g'));
    expect(scaleRequirement(q('94.0', 'g'), q('0.5', 'g'), null)).toEqual(q('94.5', 'g'));
  });
});

describe('selectScale — the prototype assignments (story 005)', () => {
  it.each([
    ['Blue RSPL', q('1460', 'g')],
    ['Red RB', q('602', 'g')],
    ['Yellow RGB', q('308.5', 'g')],
  ])('%s → scale-3kg', (_n, r) => {
    expect(pick(r, [s32, s3])).toBe('scale-3kg');
  });
  it.each([
    ['Sodium Sulphate', q('25.97', 'kg')],
    ['Soda Ash', q('11.51', 'kg')],
  ])('%s → scale-32kg', (_n, r) => {
    expect(pick(r, [s3, s32])).toBe('scale-32kg');
  });
});

describe('selectScale — capacity boundary (inclusive)', () => {
  it('exactly 3 kg → scale-3kg, in g or kg', () => {
    expect(pick(q('3000', 'g'), [s3, s32])).toBe('scale-3kg');
    expect(pick(q('3', 'kg'), [s3, s32])).toBe('scale-3kg');
  });
  it('just above 3 kg → scale-32kg', () => {
    expect(pick(q('3000.1', 'g'), [s3, s32])).toBe('scale-32kg');
    expect(pick(q('3.0001', 'kg'), [s3, s32])).toBe('scale-32kg');
  });
  it('exactly 32 kg fits; above 32 kg fits nothing', () => {
    expect(pick(q('32', 'kg'), [s3, s32])).toBe('scale-32kg');
    expect(pick(q('32.001', 'kg'), [s3, s32])).toBeNull();
  });
  it('fitsCapacity is inclusive', () => {
    expect(fitsCapacity(q('3000', 'g'), s3)).toBe(true);
    expect(fitsCapacity(q('3000.1', 'g'), s3)).toBe(false);
  });
});

describe('calibration and availability (story 007, BR-24)', () => {
  it('a scale due in the past is expired, one due in the future is valid', () => {
    expect(calibrationState({ ...s3, calibrationDueAt: PAST }, NOW)).toBe('EXPIRED');
    expect(calibrationState(s3, NOW)).toBe('VALID');
  });
  it('display state: READY / CAL_EXPIRED / OFFLINE (offline wins)', () => {
    expect(displayState(s3, NOW)).toBe('READY');
    expect(displayState({ ...s3, calibrationDueAt: PAST }, NOW)).toBe('CAL_EXPIRED');
    expect(displayState({ ...s3, connected: false }, NOW)).toBe('OFFLINE');
    expect(displayState({ ...s3, connected: false, calibrationDueAt: PAST }, NOW)).toBe('OFFLINE');
  });
  it('only a connected, in-date scale is usable', () => {
    expect(isScaleUsable(s3, NOW)).toBe(true);
    expect(isScaleUsable({ ...s3, connected: false }, NOW)).toBe(false);
    expect(isScaleUsable({ ...s3, calibrationDueAt: PAST }, NOW)).toBe(false);
  });
  it('expired small scale → the next suitable scale', () => {
    expect(pick(q('308.5', 'g'), [{ ...s3, calibrationDueAt: PAST }, s32])).toBe('scale-32kg');
  });
  it('disconnected small scale → the next suitable scale', () => {
    expect(pick(q('308.5', 'g'), [{ ...s3, connected: false }, s32])).toBe('scale-32kg');
  });
  it('no usable scale that fits → null', () => {
    expect(
      pick(q('308.5', 'g'), [
        { ...s3, connected: false },
        { ...s32, calibrationDueAt: PAST },
      ]),
    ).toBeNull();
    expect(pick(q('308.5', 'g'), [])).toBeNull();
  });
  it('a usable small scale that is too small for the load is not chosen even if the big one is down', () => {
    expect(pick(q('25.97', 'kg'), [s3, { ...s32, connected: false }])).toBeNull();
  });
});

describe('selectScale — determinism', () => {
  it('equal capacity → the lowest scale ID, whatever the input order', () => {
    const a = { ...s3, scaleId: 'a-scale' };
    const b = { ...s3, scaleId: 'b-scale' };
    expect(pick(q('100', 'g'), [b, a])).toBe('a-scale');
    expect(pick(q('100', 'g'), [a, b])).toBe('a-scale');
  });
  it('does not reorder or change the input list', () => {
    const list = [s32, s3];
    selectScale(q('100', 'g'), list, NOW);
    expect(list.map((s) => s.scaleId)).toEqual(['scale-32kg', 'scale-3kg']);
  });
});
