import { describe, expect, it } from 'vitest';
import { classifyCode, normaliseCode } from './scan-codes';

describe('scan code classification (training patterns)', () => {
  it.each([
    ['B-24187', 'BATCH'],
    ['DYE-4471', 'DYESTUFF'],
    ['AUX-0101', 'DYESTUFF'],
    ['2026-0387', 'LOT'],
    ['C-12', 'CONTAINER'],
    ['D-03', 'CONTAINER'],
    ['BDG-0417', 'BADGE'],
    ['XYZ', 'UNKNOWN'],
    ['B-2418', 'UNKNOWN'],
    ['DYE-44711', 'UNKNOWN'],
    ['', 'UNKNOWN'],
  ])('%s → %s', (code, kind) => {
    expect(classifyCode(code)).toBe(kind);
  });

  it('trims and upper-cases before classifying', () => {
    expect(normaliseCode('  dye-4471 \n')).toBe('DYE-4471');
    expect(classifyCode(' b-24187 ')).toBe('BATCH');
    expect(classifyCode('c-12')).toBe('CONTAINER');
  });
});
