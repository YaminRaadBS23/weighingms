import { describe, expect, it } from 'vitest';
import type { WeighingRecord } from '../../weighing/domain/weighing-record';
import { buildPosting } from './posting-builder';
import { allWithinTolerance, elapsedSeconds, totalDispensedKg } from './summary-math';
import { ConsumptionWriteBack } from './write-back';

const g = (value: string) => ({ value, unit: 'g' as const });
const kg = (value: string) => ({ value, unit: 'kg' as const });
const NOW = new Date('2026-10-26T08:00:00Z');

describe('totalDispensedKg', () => {
  it('sums the prototype actuals exactly: 35.322 kg', () => {
    const actuals = [g('1241.5'), g('385.4'), g('94.2'), kg('23.980'), kg('9.621')];
    expect(totalDispensedKg(actuals)).toEqual(kg('35.322'));
  });
  it('is exact where floating point is not (0.1 + 0.2 g)', () => {
    expect(totalDispensedKg([g('0.1'), g('0.2')])).toEqual(kg('0.000'));
    expect(totalDispensedKg([g('100.1'), g('200.2')])).toEqual(kg('0.300'));
  });
  it('a kilogram-only and a gram-only list give the same total', () => {
    expect(totalDispensedKg([kg('1.500'), kg('0.250')])).toEqual(kg('1.750'));
    expect(totalDispensedKg([g('1500.0'), g('250.0')])).toEqual(kg('1.750'));
  });
  it('no actuals → 0.000 kg', () => {
    expect(totalDispensedKg([])).toEqual(kg('0.000'));
  });
});

describe('allWithinTolerance / elapsedSeconds', () => {
  it('is true unless a record is OVERRIDDEN', () => {
    expect(allWithinTolerance(['IN_TOLERANCE', 'IN_TOLERANCE'])).toBe(true);
    expect(allWithinTolerance(['IN_TOLERANCE', 'OVERRIDDEN'])).toBe(false);
    expect(allWithinTolerance([])).toBe(true);
  });
  it('counts whole seconds from start to completion, never negative', () => {
    expect(elapsedSeconds('2026-10-26T07:00:00Z', '2026-10-26T07:12:30.400Z')).toBe(750);
    expect(elapsedSeconds('2026-10-26T07:00:00Z', '2026-10-26T06:59:00Z')).toBe(0);
  });
});

const rec = (sequence: number, result: 'IN_TOLERANCE' | 'OVERRIDDEN' = 'IN_TOLERANCE') =>
  ({
    sequence,
    dyestuffCode: `DYE-${sequence}`,
    lotId: `LOT-${sequence}`,
    actual: g('94.2'),
    target: g('94.0'),
    result,
  }) as unknown as WeighingRecord;

describe('buildPosting', () => {
  it('builds one line per record in sequence order from the recorded values', () => {
    const posting = buildPosting({
      completedAt: '2026-10-26T07:48:22Z',
      operatorId: 'OP-0417',
      records: [rec(3), rec(1, 'OVERRIDDEN'), rec(2)],
    });
    expect(posting.completedAt).toBe('2026-10-26T07:48:22Z');
    expect(posting.operatorId).toBe('OP-0417');
    expect(posting.lines.map((l) => l.sequence)).toEqual([1, 2, 3]);
    expect(posting.lines[0]).toEqual({
      sequence: 1,
      dyestuffCode: 'DYE-1',
      lotId: 'LOT-1',
      actual: g('94.2'),
      target: g('94.0'),
      result: 'OVERRIDDEN',
    });
  });
});

describe('ConsumptionWriteBack', () => {
  const fresh = () =>
    ConsumptionWriteBack.request({
      batchId: 'B-1',
      sessionId: 'S-1',
      idempotencyKey: 'K-1',
      now: NOW,
    });

  it('starts PENDING with no attempts and the key fixed', () => {
    const wb = fresh();
    expect(wb.snapshot()).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      idempotencyKey: 'K-1',
      lastError: null,
      postingId: null,
      confirmedAt: null,
    });
  });

  it('a failed attempt stays PENDING, counts the attempt and keeps the key', () => {
    const wb = fresh();
    wb.defer({ code: 'ORGATEX_UNAVAILABLE', message: 'down' }, NOW);
    wb.defer({ code: 'ORGATEX_UNAVAILABLE', message: 'still down' }, NOW);
    expect(wb.snapshot()).toMatchObject({
      status: 'PENDING',
      attempts: 2,
      idempotencyKey: 'K-1',
      lastError: { code: 'ORGATEX_UNAVAILABLE', message: 'still down' },
    });
  });

  it('keeps the posting id of a posting that was acknowledged before WEIGHED failed', () => {
    const wb = fresh();
    wb.defer({ code: 'INVALID_STATUS_TRANSITION', message: 'no' }, NOW, 'P-1');
    wb.defer({ code: 'ORGATEX_UNAVAILABLE', message: 'down' }, NOW);
    expect(wb.snapshot().postingId).toBe('P-1');
  });

  it('confirming records the receipt, clears the error and is final', () => {
    const wb = fresh();
    wb.defer({ code: 'ORGATEX_UNAVAILABLE', message: 'down' }, NOW);
    wb.confirm({ postingId: 'P-1', receivedAt: '2026-10-26T08:01:00Z' }, NOW);
    expect(wb.isConfirmed).toBe(true);
    expect(wb.snapshot()).toMatchObject({
      status: 'CONFIRMED',
      attempts: 2,
      postingId: 'P-1',
      confirmedAt: '2026-10-26T08:01:00Z',
      lastError: null,
    });
    expect(() => wb.defer({ code: 'X', message: 'x' }, NOW)).toThrow('final');
    expect(() => wb.confirm({ postingId: 'P-2', receivedAt: 'x' }, NOW)).toThrow('final');
  });

  it('restore keeps every field and does not share state', () => {
    const wb = fresh();
    const copy = ConsumptionWriteBack.restore(wb.snapshot());
    copy.defer({ code: 'X', message: 'x' }, NOW);
    expect(wb.attempts).toBe(0);
    expect(copy.attempts).toBe(1);
  });
});
