import { describe, expect, it } from 'vitest';
import { add, compare, convert, formatValue, quantity, subtract, toDecimal } from './quantity';

describe('quantity', () => {
  it('adds decimals exactly (no floating point artefacts)', () => {
    expect(add(quantity('0.1', 'g'), quantity('0.2', 'g'))).toEqual({ value: '0.3', unit: 'g' });
  });

  it('converts kg to g and back exactly', () => {
    expect(convert(quantity('1.850', 'kg'), 'g')).toEqual({ value: '1850', unit: 'g' });
    expect(convert(quantity('214', 'g'), 'kg')).toEqual({ value: '0.214', unit: 'kg' });
  });

  it('adds and subtracts across units in the first operand unit', () => {
    expect(add(quantity('24', 'kg'), quantity('120', 'g'))).toEqual({ value: '24.12', unit: 'kg' });
    expect(subtract(quantity('96.4', 'g'), quantity('94.0', 'g'))).toEqual({
      value: '2.4',
      unit: 'g',
    });
  });

  it('compares at tolerance boundaries', () => {
    expect(compare(quantity('93.5', 'g'), quantity('93.5', 'g'))).toBe(0);
    expect(compare(quantity('93.4', 'g'), quantity('93.5', 'g'))).toBe(-1);
    expect(compare(quantity('3', 'kg'), quantity('2999.9', 'g'))).toBe(1);
  });

  it('formats with the prototype display precision', () => {
    expect(formatValue(quantity('94', 'g'))).toBe('94.0');
    expect(formatValue(quantity('24', 'kg'))).toBe('24.000');
  });

  it('rejects values that are not decimal strings', () => {
    expect(() => toDecimal('1e3')).toThrow();
    expect(() => toDecimal('abc')).toThrow();
    expect(() => quantity('', 'g')).toThrow();
  });
});
