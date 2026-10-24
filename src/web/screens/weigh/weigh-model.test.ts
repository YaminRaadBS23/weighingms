import { describe, expect, it } from 'vitest';
import { ApiError } from '../../services/api-client';
import {
  bandCaption,
  barGeometry,
  errorText,
  okKeyState,
  remaining,
  shownWeight,
  statusText,
  zoneOf,
} from './weigh-model';

const spec = {
  target: { value: '94.0', unit: 'g' as const },
  tolerance: { value: '0.5', unit: 'g' as const },
  barMax: { value: '125', unit: 'g' as const },
};
const g = (value: string) => ({ value, unit: 'g' as const });
const kg = (value: string) => ({ value, unit: 'kg' as const });

describe('zoneOf', () => {
  it.each([
    [null, 'UNDER'],
    ['0.0', 'UNDER'],
    ['84.5', 'UNDER'], // just under 90 % of 94
    ['84.6', 'NEAR'],
    ['93.4', 'NEAR'],
    ['93.5', 'OK'], // lower limit inclusive
    ['94.5', 'OK'], // upper limit inclusive
    ['94.6', 'OVER'],
  ])('%s g → %s', (w, zone) => {
    expect(zoneOf(w === null ? null : g(w), spec)).toBe(zone);
  });

  it('converts a reading in another unit before judging', () => {
    const kgSpec = { target: kg('24.000'), tolerance: kg('0.100') };
    expect(zoneOf(g('24050.0'), kgSpec)).toBe('OK');
    expect(zoneOf(g('24200.0'), kgSpec)).toBe('OVER');
  });
});

describe('readout text', () => {
  it('shows "—" without a reading and the reading in the component unit with it', () => {
    expect(shownWeight(null, spec)).toBe('—');
    expect(shownWeight(g('93.5'), spec)).toBe('93.5');
    expect(shownWeight(g('24050.0'), { target: kg('24.000'), tolerance: kg('0.1') })).toBe(
      '24.050',
    );
  });

  it('still-to-weigh never goes below zero', () => {
    expect(remaining(null, spec)).toEqual(g('94.0'));
    expect(remaining(g('90.0'), spec).value).toBe('4');
    expect(remaining(g('100.0'), spec).value).toBe('0');
  });

  it('status line wording follows the prototype', () => {
    expect(statusText(null, spec)).toBe('DISPENSE — 94.0 g REMAINING');
    expect(statusText(g('90.0'), spec)).toBe('DISPENSE — 4.0 g REMAINING');
    expect(statusText(g('94.0'), spec)).toBe('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    expect(statusText(g('96.4'), spec)).toBe('OVER TOLERANCE — SURPLUS +2.4 g');
  });

  it('caption shows the tolerance and its limits', () => {
    expect(bandCaption(spec)).toBe('TOLERANCE ±0.5 g  (93.5 – 94.5)');
  });
});

describe('barGeometry', () => {
  it('places fill, band and target as percentages of the bar maximum', () => {
    const geo = barGeometry(g('62.5'), spec);
    expect(geo.fill).toBeCloseTo(50);
    expect(geo.targetLeft).toBeCloseTo(75.2);
    expect(geo.bandLeft).toBeCloseTo(74.8);
    expect(geo.bandWidth).toBeCloseTo(0.8);
  });

  it('clamps the fill to the bar and treats no reading as empty', () => {
    expect(barGeometry(g('500'), spec).fill).toBe(100);
    expect(barGeometry(g('-3'), spec).fill).toBe(0);
    expect(barGeometry(null, spec).fill).toBe(0);
  });
});

describe('okKeyState', () => {
  const ready = { unlocked: true, stable: true, scaleReady: true, zone: 'OK' as const };

  it('is enabled only when everything holds', () => {
    expect(okKeyState(ready)).toEqual({ enabled: true, reason: null });
  });

  it.each([
    [{ unlocked: false }, 'weigh.ok.locked'],
    [{ scaleReady: false }, 'weigh.ok.scale'],
    [{ stable: null }, 'weigh.ok.noReading'],
    [{ stable: false }, 'weigh.ok.unstable'],
    [{ zone: 'NEAR' as const }, 'weigh.ok.zone'],
    [{ zone: 'OVER' as const }, 'weigh.ok.zone'],
    [{ zone: 'UNDER' as const }, 'weigh.ok.zone'],
  ])('%j disables OK with %s', (change, reason) => {
    expect(okKeyState({ ...ready, ...change })).toEqual({ enabled: false, reason });
  });
});

describe('errorText', () => {
  it('uses catalogue wording for known codes and the server message otherwise', () => {
    expect(errorText(new ApiError(422, 'WRONG_DYESTUFF', 'raw'))).toBe('Wrong dyestuff');
    expect(errorText(new ApiError(500, 'SOMETHING_NEW', 'server words'))).toBe('server words');
    expect(errorText(new Error('boom'))).toBe('WeighingMS server not reachable');
  });
});
