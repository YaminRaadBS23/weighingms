import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { TicketContent } from '../../../../shared/ticket';
import { openWeighingDb } from '../../../db/weighingms/db';
import { DrizzleWeighingSessionRepository } from '../../weighing/infrastructure/drizzle-repositories';
import { readStationSeed, seedOperatorsIfEmpty } from '../../weighing/infrastructure/seed';
import { WeighingSession } from '../../weighing/domain/weighing-session';
import { Ticket } from '../domain/ticket';
import { DrizzleTicketRepository } from './drizzle-ticket-repository';

const T0 = new Date('2026-10-26T08:00:00Z');
let close: (() => void) | undefined;
afterEach(() => close?.());

function setup() {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  seedOperatorsIfEmpty(opened.db, readStationSeed(path.resolve('data/seed/station-seed.json')));
  const sessions = new DrizzleWeighingSessionRepository(opened.db);
  for (const [sessionId, batchId] of [
    ['S-1', 'B-1'],
    ['S-2', 'B-2'],
  ] as const) {
    sessions.save(
      WeighingSession.start({
        sessionId,
        batchId,
        stationId: 'STN-01',
        startedBy: 'OP-0417',
        recipe: {
          recipeId: 'R',
          version: '1',
          shade: 'Teal',
          orderRef: 'SO-1',
          machineRef: 'JET-1',
          components: [
            {
              sequence: 1,
              dyestuff: { code: 'D-1', name: 'D', shortName: 'D', colourHex: '#000', type: 'DYE' },
              target: { value: '94.0', unit: 'g' },
              tolerance: { value: '0.5', unit: 'g' },
              barMax: { value: '125', unit: 'g' },
              suggestedLotId: null,
            },
          ],
          takenAt: T0.toISOString(),
        },
        now: T0,
      }),
    );
  }
  return { db: opened.db, repo: new DrizzleTicketRepository(opened.db) };
}

const content = (batch: string, reprint = false): TicketContent =>
  ({
    title: 'FCI DYEING — WEIGHING TICKET',
    batch,
    barcodeValue: batch,
    reprint,
    rows: [],
    verdict: ['ALL WITHIN TOLERANCE'],
    lines: ['FCI DYEING — WEIGHING TICKET', `BATCH   ${batch}`],
  }) as unknown as TicketContent;

const original = (id: string, batch: string, session: string, at = T0) =>
  Ticket.create({
    ticketId: id,
    batchId: batch,
    sessionId: session,
    content: content(batch),
    reprintOf: null,
    createdBy: 'OP-0417',
    now: at,
  });
const copyOf = (id: string, source: string, batch: string, session: string, at = T0) =>
  Ticket.create({
    ticketId: id,
    batchId: batch,
    sessionId: session,
    content: content(batch, true),
    reprintOf: source,
    createdBy: 'OP-0901',
    now: at,
  });
const printed = (t: Ticket) => {
  t.markPrinted({ jobId: 'J-1', printedAt: '2026-10-26T08:01:00Z' }, T0);
  return t;
};

describe('DrizzleTicketRepository', () => {
  it('round-trips a stored ticket with its content', () => {
    const { repo } = setup();
    const t = original('T-1', 'B-1', 'S-1');
    repo.create(t);
    expect(repo.findById('T-1')?.snapshot()).toEqual(t.snapshot());
    expect(repo.findById('T-404')).toBeUndefined();
  });

  it('round-trips a failure, then the successful retry', () => {
    const { repo } = setup();
    const t = original('T-1', 'B-1', 'S-1');
    repo.create(t);
    t.markFailed({ code: 'PRINTER_UNAVAILABLE', state: 'OUT_OF_PAPER', message: 'no paper' }, T0);
    repo.save(t);
    expect(repo.findById('T-1')?.snapshot()).toMatchObject({
      printStatus: 'FAILED',
      printAttempts: 1,
      lastError: { code: 'PRINTER_UNAVAILABLE', state: 'OUT_OF_PAPER', message: 'no paper' },
    });
    printed(t);
    repo.save(t);
    expect(repo.findById('T-1')?.snapshot()).toMatchObject({
      printStatus: 'PRINTED',
      printAttempts: 2,
      lastError: null,
      jobId: 'J-1',
      printedAt: '2026-10-26T08:01:00Z',
    });
  });

  it('a failure without a known state round-trips with state null', () => {
    const { repo } = setup();
    const t = original('T-1', 'B-1', 'S-1');
    repo.create(t);
    t.markFailed({ code: 'DEVICE_PROTOCOL_ERROR', state: null, message: 'garbled' }, T0);
    repo.save(t);
    expect(repo.findById('T-1')?.snapshot().lastError).toEqual({
      code: 'DEVICE_PROTOCOL_ERROR',
      state: null,
      message: 'garbled',
    });
  });

  it('finds the original of a batch, never a reprint, and lists original first then copies', () => {
    const { repo } = setup();
    const o = printed(original('T-1', 'B-1', 'S-1'));
    repo.create(original('T-1', 'B-1', 'S-1'));
    repo.save(o);
    repo.create(copyOf('T-2', 'T-1', 'B-1', 'S-1', new Date('2026-10-26T08:10:00Z')));
    repo.create(original('T-3', 'B-2', 'S-2'));
    expect(repo.findOriginalByBatch('B-1')?.ticketId).toBe('T-1');
    expect(repo.findOriginalByBatch('B-404')).toBeUndefined();
    expect(repo.listByBatch('B-1').map((t) => [t.ticketId, t.isReprint])).toEqual([
      ['T-1', false],
      ['T-2', true],
    ]);
    expect(repo.listByBatch('B-404')).toEqual([]);
  });

  it('only one original per batch', () => {
    const { repo } = setup();
    repo.create(original('T-1', 'B-1', 'S-1'));
    expect(() => repo.create(original('T-2', 'B-1', 'S-1'))).toThrow();
  });
});

describe('tickets triggers (ADR-11)', () => {
  /** Runs raw SQL and returns the error text including Drizzle's wrapped cause. */
  const raw = (db: ReturnType<typeof setup>['db'], statement: string): string => {
    try {
      db.run(sql.raw(statement));
      return '';
    } catch (err) {
      const e = err as Error & { cause?: Error };
      return `${e.message} ${e.cause?.message ?? ''}`;
    }
  };
  const insert = (
    id: string,
    extra: { reprint?: string; status?: string; attempts?: number } = {},
  ) =>
    `INSERT INTO tickets (ticket_id, batch_id, session_id, is_reprint, reprint_of, content, barcode_value, print_status, print_attempts, created_by, created_at, updated_at) VALUES ('${id}','B-1','S-1',${extra.reprint ? 1 : 0},${extra.reprint ? `'${extra.reprint}'` : 'NULL'},'{}','B-1','${extra.status ?? 'NOT_SENT'}',${extra.attempts ?? 0},'OP-0417','x','x')`;

  it('refuses DELETE', () => {
    const { db, repo } = setup();
    repo.create(original('T-1', 'B-1', 'S-1'));
    expect(raw(db, "DELETE FROM tickets WHERE ticket_id = 'T-1'")).toMatch(/cannot be deleted/);
  });

  it.each([
    ['ticket_id', "'T-9'"],
    ['batch_id', "'B-9'"],
    ['session_id', "'S-2'"],
    ['is_reprint', '1'],
    ['reprint_of', "'T-9'"],
    ['content', "'{}'"],
    ['barcode_value', "'B-9'"],
    ['created_by', "'OP-0901'"],
    ['created_at', "'y'"],
  ])('refuses to change %s', (column, value) => {
    const { db, repo } = setup();
    repo.create(original('T-1', 'B-1', 'S-1'));
    expect(raw(db, `UPDATE tickets SET ${column} = ${value}`)).toMatch(/cannot change/);
  });

  it('the print outcome can change while the ticket is not printed', () => {
    const { db, repo } = setup();
    repo.create(original('T-1', 'B-1', 'S-1'));
    expect(raw(db, "UPDATE tickets SET print_status = 'FAILED', print_attempts = 1")).toBe('');
  });

  it('a PRINTED ticket never changes again', () => {
    const { db, repo } = setup();
    const t = printed(original('T-1', 'B-1', 'S-1'));
    repo.create(original('T-1', 'B-1', 'S-1'));
    repo.save(t);
    expect(raw(db, 'UPDATE tickets SET print_attempts = 9')).toMatch(
      /printed ticket cannot change/,
    );
    expect(raw(db, "UPDATE tickets SET print_status = 'FAILED'")).toMatch(/cannot change/);
  });

  it('PRINTED needs its job and time', () => {
    const { db, repo } = setup();
    repo.create(original('T-1', 'B-1', 'S-1'));
    expect(raw(db, "UPDATE tickets SET print_status = 'PRINTED'")).toMatch(
      /needs its job and time/,
    );
  });

  it('refuses an unknown print status', () => {
    const { db, repo } = setup();
    repo.create(original('T-1', 'B-1', 'S-1'));
    expect(raw(db, "UPDATE tickets SET print_status = 'DONE'")).toMatch(/unknown print status/);
  });

  it('a new ticket starts NOT_SENT with no attempts', () => {
    const { db } = setup();
    expect(raw(db, insert('T-1', { status: 'PRINTED' }))).toMatch(/starts NOT_SENT/);
    expect(raw(db, insert('T-2', { attempts: 1 }))).toMatch(/starts NOT_SENT/);
    expect(raw(db, insert('T-3'))).toBe('');
  });

  it('an original names no source; a reprint needs a PRINTED source', () => {
    const { db, repo } = setup();
    repo.create(original('T-1', 'B-1', 'S-1'));
    expect(raw(db, insert('T-2', { reprint: 'T-1' }))).toMatch(/needs a printed ticket/); // NOT_SENT source
    expect(raw(db, insert('T-3', { reprint: 'T-404' }))).toMatch(/needs a printed ticket/);
    repo.save(printed(original('T-1', 'B-1', 'S-1')));
    expect(raw(db, insert('T-4', { reprint: 'T-1' }))).toBe('');
    expect(raw(db, insert('T-5').replace("0,NULL,'{}'", "0,'T-1','{}'"))).toMatch(/not a copy/);
  });
});
