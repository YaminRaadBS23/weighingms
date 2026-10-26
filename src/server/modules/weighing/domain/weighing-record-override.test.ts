import { describe, expect, it } from 'vitest';
import { buildRecord, type BuildRecordInput } from './weighing-record';
import type { ComponentSpec } from './weighing-session';

const T1 = new Date('2026-10-26T07:05:00Z');
const spec: ComponentSpec = {
  sequence: 3,
  dyestuff: { code: 'DYE-4471', name: 'Yellow', shortName: 'Y', colourHex: '#000', type: 'DYE' },
  target: { value: '94.0', unit: 'g' },
  tolerance: { value: '0.5', unit: 'g' },
  barMax: { value: '125', unit: 'g' },
  suggestedLotId: null,
};
const input = (actual: string, override?: BuildRecordInput['override']): BuildRecordInput => ({
  recordId: 'R-1',
  sessionId: 'S-1',
  batchId: 'B-24187',
  spec,
  actual: { value: actual, unit: 'g' },
  lotId: '2026-0387',
  containerId: 'C-12',
  tare: { value: '214.0', unit: 'g' },
  scaleId: 'scale-3kg',
  operatorId: 'OP-0417',
  confirmedAt: T1,
  ...(override ? { override } : {}),
});
const sup = { supervisorId: 'OP-0901', reason: 'Customer approved' };

describe('buildRecord with an override (FR-22, ADR-9, TD-10)', () => {
  it('an over weight: OVERRIDDEN, zone OVER, surplus from the target', () => {
    const r = buildRecord(input('96.4', sup));
    expect(r.result).toBe('OVERRIDDEN');
    expect(r.surplus).toEqual({ amount: { value: '2.4', unit: 'g' }, percent: '2.6' });
    expect(r.override).toEqual({
      supervisorId: 'OP-0901',
      reason: 'Customer approved',
      zone: 'OVER',
      authorisedAt: T1.toISOString(),
    });
  });

  it.each([
    ['93.0', 'NEAR'],
    ['50.0', 'UNDER'],
  ])('an under weight (%s g, %s): OVERRIDDEN with the zone and no surplus', (w, zone) => {
    const r = buildRecord(input(w, sup));
    expect(r.result).toBe('OVERRIDDEN');
    expect(r.surplus).toBeNull();
    expect(r.override?.zone).toBe(zone);
  });

  it('keeps the actual as measured, the operator of the station and the snapshot of the limits', () => {
    const r = buildRecord(input('96.4', sup));
    expect(r).toMatchObject({
      actual: { value: '96.4', unit: 'g' },
      operatorId: 'OP-0417',
      target: { value: '94.0', unit: 'g' },
      toleranceLower: { value: '93.5', unit: 'g' },
      toleranceUpper: { value: '94.5', unit: 'g' },
    });
  });

  it('without an override the record is IN_TOLERANCE with neither surplus nor override', () => {
    const r = buildRecord(input('94.2'));
    expect(r).toMatchObject({ result: 'IN_TOLERANCE', surplus: null, override: null });
  });

  it('an in-tolerance weight cannot carry an override', () => {
    expect(() => buildRecord(input('94.2', sup))).toThrow(/in-tolerance/);
  });
});
