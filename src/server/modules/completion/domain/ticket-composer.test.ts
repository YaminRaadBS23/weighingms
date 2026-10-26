import { describe, expect, it } from 'vitest';
import type { Quantity } from '../../../../shared/quantity';
import type { WeighingRecord } from '../../weighing/domain/weighing-record';
import type { WeighingSessionProps } from '../../weighing/domain/weighing-session';
import { asReprint, compose, fit, TICKET_TITLE, TICKET_WIDTH } from './ticket-composer';

const q = (value: string, unit: 'g' | 'kg' = 'g'): Quantity => ({ value, unit });

const SHORT = ['Blue RSPL', 'Red RB', 'Yellow RGB', 'Na2SO4', 'Soda Ash'];
const TARGETS = [q('1240.0'), q('386.0'), q('94.0'), q('24.000', 'kg'), q('9.600', 'kg')];

function session(extra: Partial<WeighingSessionProps['recipe']> = {}): WeighingSessionProps {
  return {
    sessionId: 'S-1',
    batchId: 'B-24187',
    startedBy: 'OP-0417',
    recipe: {
      recipeId: 'R',
      version: '1',
      shade: 'Teal 4C',
      orderRef: 'SO-9931',
      machineRef: 'JET-04',
      takenAt: '2026-08-04T07:30:00Z',
      components: SHORT.map((shortName, i) => ({
        sequence: i + 1,
        dyestuff: {
          code: `D-${i}`,
          name: `${shortName} long`,
          shortName,
          colourHex: '#000',
          type: 'DYE',
        },
        target: TARGETS[i]!,
        tolerance: q('1.0'),
        barMax: q('9999'),
        suggestedLotId: null,
      })),
      ...extra,
    },
    completedAt: '2026-08-04T07:48:31.000Z',
    updatedAt: '2026-08-04T07:48:31.000Z',
  } as unknown as WeighingSessionProps;
}

function record(seq: number, actual: Quantity, over = false): WeighingRecord {
  return {
    sequence: seq,
    dyestuffCode: `D-${seq - 1}`,
    dyestuffName: `${SHORT[seq - 1]} long`,
    target: TARGETS[seq - 1]!,
    actual,
    result: over ? 'OVERRIDDEN' : 'IN_TOLERANCE',
  } as unknown as WeighingRecord;
}

const prototypeRecords = () => [
  record(1, q('1240.0')),
  record(2, q('386.0')),
  record(3, q('94.0')),
  record(4, q('24.000', 'kg')),
  record(5, q('9.600', 'kg')),
];
const operator = { operatorId: 'OP-0417', name: 'R. Karim' };

describe('compose', () => {
  it('lays the prototype ticket out as 32-character text', () => {
    const c = compose({ session: session(), records: prototypeRecords(), operator });
    expect(c.lines).toEqual([
      'FCI DYEING — WEIGHING TICKET',
      '--------------------------------',
      'BATCH   B-24187',
      'ORDER   SO-9931',
      'MACHINE JET-04',
      'SHADE   Teal 4C',
      'DATE    2026-08-04 07:48',
      'OPER.   R. Karim (OP-0417)',
      '--------------------------------',
      'NAME           TGT     ACT UNIT',
      'Blue RSPL   1240.0  1240.0 g  ',
      'Red RB       386.0   386.0 g  ',
      'Yellow RGB    94.0    94.0 g  ',
      'Na2SO4      24.000  24.000 kg ',
      'Soda Ash     9.600   9.600 kg ',
      '--------------------------------',
      'ALL WITHIN TOLERANCE',
    ]);
    expect(c).toMatchObject({
      title: TICKET_TITLE,
      batch: 'B-24187',
      barcodeValue: 'B-24187',
      reprint: false,
      verdict: ['ALL WITHIN TOLERANCE'],
    });
    expect(c.lines.every((l) => l.length <= TICKET_WIDTH)).toBe(true);
  });

  it('puts the rows in sequence order whatever the order of the records', () => {
    const c = compose({ session: session(), records: prototypeRecords().reverse(), operator });
    expect(c.rows.map((r) => r.shortName)).toEqual(SHORT);
  });

  it('shows target and actual in the recipe unit: exact conversion, rounded half up to the unit precision', () => {
    const c = compose({
      session: session(),
      records: [
        record(1, q('1.2403', 'kg')), // 1240.3 g
        record(2, q('386.05')), // → 386.1 (half up)
        record(3, q('0.0940', 'kg')), // 94 g
        record(4, q('24012', 'g')), // 24.012 kg
        record(5, q('9.6004', 'kg')),
      ],
      operator,
    });
    expect(c.rows.map((r) => [r.target, r.actual, r.unit])).toEqual([
      ['1240.0', '1240.3', 'g'],
      ['386.0', '386.1', 'g'],
      ['94.0', '94.0', 'g'],
      ['24.000', '24.012', 'kg'],
      ['9.600', '9.600', 'kg'],
    ]);
  });

  it('prints the completion time in UTC', () => {
    const c = compose({
      session: session(),
      records: prototypeRecords(),
      operator,
    });
    expect(c.date).toBe('2026-08-04 07:48');
    const late = session();
    late.completedAt = '2026-12-31T23:59:59.999Z';
    expect(compose({ session: late, records: prototypeRecords(), operator }).date).toBe(
      '2026-12-31 23:59',
    );
  });

  it('prints "-" for an order or machine a session never had (started before the snapshot carried them)', () => {
    const c = compose({
      session: session({ orderRef: undefined, machineRef: undefined }),
      records: prototypeRecords(),
      operator,
    });
    expect([c.order, c.machine]).toEqual(['-', '-']);
    expect(c.lines).toContain('ORDER   -');
  });

  it('lists one EXCEPTION line per overridden component instead of "ALL WITHIN TOLERANCE"', () => {
    const records = prototypeRecords();
    records[2] = record(3, q('96.4'), true);
    records[4] = record(5, q('9.7', 'kg'), true);
    const c = compose({ session: session(), records, operator });
    expect(c.verdict).toEqual(['EXCEPTION Yellow RGB OVERRIDDEN', 'EXCEPTION Soda Ash OVERRIDDEN']);
    expect(c.lines.slice(-2)).toEqual(c.verdict);
    expect(c.lines).not.toContain('ALL WITHIN TOLERANCE');
  });

  it('cuts fields that are too long with "~" and keeps every line within 32 characters', () => {
    const c = compose({
      session: session({
        shade: 'A very long shade name that cannot fit',
        machineRef: 'M'.repeat(40),
      }),
      records: prototypeRecords(),
      operator: { operatorId: 'OP-0001', name: 'Someone With A Rather Long Name' },
    });
    expect(c.lines.every((l) => l.length <= TICKET_WIDTH)).toBe(true);
    expect(c.lines.find((l) => l.startsWith('SHADE'))).toMatch(/~$/);
    expect(fit('abc', 5)).toBe('abc');
    expect(fit('abcdef', 5)).toBe('abcd~');
  });

  it('falls back to the operator id when the operator is unknown', () => {
    expect(
      compose({ session: session(), records: prototypeRecords(), operator: undefined }).operator,
    ).toBe('OP-0417');
  });
});

describe('asReprint', () => {
  it('is the same ticket plus the REPRINT marking, nothing else', () => {
    const original = compose({ session: session(), records: prototypeRecords(), operator });
    const copy = asReprint(original);
    expect(copy.reprint).toBe(true);
    expect(copy.lines.filter((l) => l !== '*** REPRINT ***')).toEqual(original.lines);
    expect(copy.lines[1]).toBe('*** REPRINT ***');
    expect({ ...copy, lines: [], reprint: false }).toEqual({
      ...original,
      lines: [],
      reprint: false,
    });
    expect(original.reprint).toBe(false); // the original is not touched
  });
});
