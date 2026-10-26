import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { openWeighingDb } from '../../../db/weighingms/db';
import { readStationSeed, seedOperatorsIfEmpty } from '../../weighing/infrastructure/seed';
import { DrizzleWeighingSessionRepository } from '../../weighing/infrastructure/drizzle-repositories';
import { WeighingSession } from '../../weighing/domain/weighing-session';
import { ConsumptionWriteBack } from '../domain/write-back';
import { DrizzleWriteBackRepository } from './drizzle-write-back-repository';

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
  return { db: opened.db, repo: new DrizzleWriteBackRepository(opened.db), sessions };
}

const request = (batchId: string, sessionId: string, key: string) =>
  ConsumptionWriteBack.request({ batchId, sessionId, idempotencyKey: key, now: T0 });

describe('DrizzleWriteBackRepository', () => {
  it('round-trips a PENDING write-back with its failure', () => {
    const { repo } = setup();
    const wb = request('B-1', 'S-1', 'K-1');
    repo.create(wb);
    wb.defer({ code: 'ORGATEX_UNAVAILABLE', message: 'down' }, T0, 'P-9');
    repo.save(wb);
    expect(repo.findByBatch('B-1')?.snapshot()).toEqual(wb.snapshot());
    expect(repo.findByBatch('B-404')).toBeUndefined();
  });

  it('round-trips a CONFIRMED write-back and lists confirmed batches only', () => {
    const { repo } = setup();
    const a = request('B-1', 'S-1', 'K-1');
    const b = request('B-2', 'S-2', 'K-2');
    repo.create(a);
    repo.create(b);
    a.confirm({ postingId: 'P-1', receivedAt: '2026-10-26T08:01:00Z' }, T0);
    repo.save(a);
    expect(repo.findByBatch('B-1')?.snapshot()).toMatchObject({
      status: 'CONFIRMED',
      postingId: 'P-1',
      confirmedAt: '2026-10-26T08:01:00Z',
      lastError: null,
    });
    expect([...repo.confirmedBatchIds()]).toEqual(['B-1']);
  });

  it('one write-back per batch and one batch per key', () => {
    const { repo } = setup();
    repo.create(request('B-1', 'S-1', 'K-1'));
    expect(() => repo.create(request('B-1', 'S-1', 'K-2'))).toThrow();
    expect(() => repo.create(request('B-2', 'S-2', 'K-1'))).toThrow();
  });

  it('the session repository lists completed batches and finds the completed session', () => {
    const { sessions } = setup();
    expect(sessions.listCompletedBatchIds()).toEqual([]);
    expect(sessions.findCompletedByBatch('B-1')).toBeUndefined();
  });
});

describe('write_backs triggers (ADR-10)', () => {
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

  it('refuses DELETE', () => {
    const { db, repo } = setup();
    repo.create(request('B-1', 'S-1', 'K-1'));
    expect(raw(db, "DELETE FROM write_backs WHERE batch_id = 'B-1'")).toMatch(/cannot be deleted/);
  });

  it.each([
    ['batch_id', "'B-9'"],
    ['session_id', "'S-2'"],
    ['idempotency_key', "'K-9'"],
  ])('refuses to change %s', (column, value) => {
    const { db, repo } = setup();
    repo.create(request('B-1', 'S-1', 'K-1'));
    expect(raw(db, `UPDATE write_backs SET ${column} = ${value}`)).toMatch(/cannot change/);
  });

  it('a CONFIRMED row never changes again', () => {
    const { db, repo } = setup();
    const wb = request('B-1', 'S-1', 'K-1');
    repo.create(wb);
    wb.confirm({ postingId: 'P-1', receivedAt: 'x' }, T0);
    repo.save(wb);
    expect(raw(db, 'UPDATE write_backs SET attempts = 9')).toMatch(
      /confirmed write-back cannot change/,
    );
    expect(raw(db, "UPDATE write_backs SET status = 'PENDING'")).toMatch(/cannot change/);
  });

  it('CONFIRMED needs its receipt', () => {
    const { db, repo } = setup();
    repo.create(request('B-1', 'S-1', 'K-1'));
    expect(raw(db, "UPDATE write_backs SET status = 'CONFIRMED'")).toMatch(/needs its receipt/);
  });

  it('refuses an unknown status', () => {
    const { db } = setup();
    const sqlText =
      "INSERT INTO write_backs (batch_id, session_id, idempotency_key, status, attempts, created_at, updated_at) VALUES ('B-1','S-1','K','DONE',0,'x','x')";
    expect(raw(db, sqlText)).toMatch(/unknown write-back status/);
  });
});
