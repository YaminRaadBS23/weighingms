import { describe, expect, it } from 'vitest';
import { SESSION } from '../test/mock-api';
import { activeTarget, landingWeight, parseWeight } from './training-model';

describe('activeTarget', () => {
  it('is the ACTIVE component with its scale and target', () => {
    const session = {
      ...SESSION,
      components: SESSION.components.map((c) =>
        c.sequence === 1
          ? { ...c, scale: { scaleId: 'scale-a', mode: 'AUTO' as const, reason: null } }
          : c,
      ),
    };
    expect(activeTarget(session)).toEqual({
      sequence: 1,
      name: 'D1',
      scaleId: 'scale-a',
      target: { value: '94.0', unit: 'g' },
      tolerance: { value: '0.5', unit: 'g' },
    });
  });

  it('has no scale before one is chosen, and is null without a session or an active component', () => {
    expect(activeTarget(SESSION)?.scaleId).toBeNull();
    expect(activeTarget(null)).toBeNull();
    expect(
      activeTarget({
        ...SESSION,
        components: SESSION.components.map((c) => ({ ...c, state: 'DONE' as const })),
      }),
    ).toBeNull();
  });
});

describe('landingWeight', () => {
  const a = {
    target: { value: '94.0', unit: 'g' as const },
    tolerance: { value: '0.5', unit: 'g' as const },
  };

  it('EXACT is the target', () => {
    expect(landingWeight('EXACT', a)).toEqual({ value: '94.0', unit: 'g' });
  });

  it('OVER is target + 3 × tolerance, outside the band', () => {
    expect(landingWeight('OVER', a)).toEqual({ value: '95.5', unit: 'g' });
  });

  it('converts a tolerance given in another unit to the target unit, exactly', () => {
    expect(
      landingWeight('OVER', {
        target: { value: '24.000', unit: 'kg' },
        tolerance: { value: '5', unit: 'g' },
      }),
    ).toEqual({ value: '24.015', unit: 'kg' });
  });
});

describe('parseWeight', () => {
  it('accepts a plain decimal in the given unit, trimmed', () => {
    expect(parseWeight(' 94.0 ', 'g')).toEqual({ value: '94.0', unit: 'g' });
    expect(parseWeight('3', 'kg')).toEqual({ value: '3', unit: 'kg' });
  });

  it.each(['', 'abc', '-1', '1,5', '1e3', '.5', '5.'])('rejects "%s"', (text) => {
    expect(parseWeight(text, 'g')).toBeNull();
  });
});
