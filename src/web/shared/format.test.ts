import { describe, expect, it } from 'vitest';
import { capacity, hhmm, hhmmss, qty } from './format';

describe('display formatting', () => {
  it('formats times as hh:mm and hh:mm:ss (station-local)', () => {
    const d = new Date(2026, 9, 16, 7, 5, 3);
    expect(hhmm(d.toISOString())).toBe('07:05');
    expect(hhmmss(d)).toBe('07:05:03');
  });

  it('shows quantities with the prototype precision (g 1 decimal, kg 3 decimals)', () => {
    expect(qty({ value: '94', unit: 'g' })).toBe('94.0 g');
    expect(qty({ value: '24', unit: 'kg' })).toBe('24.000 kg');
  });

  it('shows a scale capacity without forced decimals', () => {
    expect(capacity({ value: '3', unit: 'kg' })).toBe('3 kg');
    expect(capacity({ value: '32', unit: 'kg' })).toBe('32 kg');
  });
});
