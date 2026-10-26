import { describe, expect, it } from 'vitest';
import { Code128Error, encode, PATTERNS, toSvg } from './code128';

describe('Code 128 pattern table', () => {
  it('has 107 distinct patterns, each 11 modules wide (the stop pattern 13)', () => {
    expect(PATTERNS).toHaveLength(107);
    expect(new Set(PATTERNS).size).toBe(107);
    PATTERNS.forEach((p, code) => {
      const modules = [...p].reduce((sum, digit) => sum + Number(digit), 0);
      expect(modules, `code ${code}`).toBe(code === 106 ? 13 : 11);
      expect([...p].every((d) => d >= '1' && d <= '4')).toBe(true);
    });
  });
});

describe('encode', () => {
  it('B-24187: start B, characters, check digit 70, stop', () => {
    // 104 + 34·1 + 13·2 + 18·3 + 20·4 + 17·5 + 24·6 + 23·7 = 688; 688 mod 103 = 70
    const symbol = encode('B-24187');
    expect(symbol.codes).toEqual([104, 34, 13, 18, 20, 17, 24, 23, 70, 106]);
    expect(symbol.checkDigit).toBe(70);
  });

  it('check digit follows the published weighting (PJJ123C, the usual example, start B)', () => {
    // The published example with start A sums to 878 → 54; start B adds one → 879 → 55.
    expect(encode('PJJ123C').checkDigit).toBe(55);
  });

  it('is 11 modules per start/character/check plus 13 for the stop', () => {
    const { widths } = encode('B-24187');
    expect(widths.reduce((a, b) => a + b, 0)).toBe(11 * 9 + 13);
  });

  it('refuses characters set B cannot carry, and empty values', () => {
    expect(() => encode('')).toThrow(Code128Error);
    expect(() => encode('B-24187é')).toThrow(/cannot carry/);
    expect(() => encode('B\t1')).toThrow(Code128Error);
    expect(() => encode('B~\x7f')).toThrow(Code128Error);
  });

  it('carries the whole printable range', () => {
    const all = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
    expect(encode(all).codes.slice(1, -2)).toEqual(Array.from({ length: 95 }, (_, i) => i));
  });
});

describe('toSvg', () => {
  const svg = toSvg('B-24187');

  it('is a self-contained SVG with a quiet zone and one rect per bar', () => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/<\/svg>$/);
    // 9 symbols with 3 bars + the stop with 4 + the white background
    expect(svg.match(/<rect /g)).toHaveLength(9 * 3 + 4 + 1);
    expect(svg).toContain('viewBox="0 0 264 60"'); // (112 + 2·10) modules × 2
    expect(svg).toContain('<rect x="20" y="0" width="4" height="60"/>'); // first bar after 10 modules
  });

  it('references nothing outside itself', () => {
    expect(svg).not.toMatch(/href|<script|<image|url\(/);
    expect(svg.match(/https?:\/\/[^"]+/g)).toEqual(['http://www.w3.org/2000/svg']);
  });

  it('is a pure function of the value', () => {
    expect(toSvg('B-24187')).toBe(svg);
    expect(toSvg('B-24188')).not.toBe(svg);
  });

  it('refuses a value it cannot encode instead of drawing a wrong symbol', () => {
    expect(() => toSvg('é')).toThrow(Code128Error);
  });
});
