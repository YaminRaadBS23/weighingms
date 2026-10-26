import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openWeighingDb } from '../../../db/weighingms/db';
import { buildRecord, type WeighingRecord } from '../domain/weighing-record';
import type { ComponentSpec } from '../domain/weighing-session';
import { WeighingSession } from '../domain/weighing-session';
import {
  DrizzleWeighingRecordRepository,
  DrizzleWeighingSessionRepository,
} from './drizzle-repositories';
import { readStationSeed, seedOperatorsIfEmpty } from './seed';

const T0 = new Date('2026-10-25T07:00:00Z');
const spec = (sequence: number): ComponentSpec => ({
  sequence,
  dyestuff: {
    code: `DYE-000${sequence}`,
    name: `Dye ${sequence}`,
    shortName: 'D',
    colourHex: '#000',
    type: 'DYE',
  },
  target: { value: '94.0', unit: 'g' },
  tolerance: { value: '0.5', unit: 'g' },
  barMax: { value: '125', unit: 'g' },
  suggestedLotId: null,
});

let close: (() => void) | undefined;
afterEach(() => close?.());

function setup() {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  seedOperatorsIfEmpty(opened.db, readStationSeed(path.resolve('data/seed/station-seed.json')));
  const sessions = new DrizzleWeighingSessionRepository(opened.db);
  sessions.save(
    WeighingSession.start({
      sessionId: 'S-1',
      batchId: 'B-24187',
      stationId: 'STN-01',
      startedBy: 'OP-0417',
      recipe: {
        recipeId: 'R',
        version: '1',
        shade: 'Teal 4C',
        components: [spec(1), spec(2), spec(3)],
        takenAt: T0.toISOString(),
      },
      now: T0,
    }),
  );
  return { db: opened.db, repo: new DrizzleWeighingRecordRepository(opened.db) };
}

const record = (sequence: number, actual = '94.2'): WeighingRecord =>
  buildRecord({
    recordId: `R-${sequence}`,
    sessionId: 'S-1',
    batchId: 'B-24187',
    spec: spec(sequence),
    actual: { value: actual, unit: 'g' },
    lotId: '2026-0387',
    containerId: 'C-12',
    tare: { value: '214.0', unit: 'g' },
    scaleId: 'scale-3kg',
    operatorId: 'OP-0417',
    confirmedAt: T0,
  });

/** The error text including Drizzle's wrapped cause (raw SQL errors are wrapped). */
function failure(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    const e = err as Error & { cause?: Error };
    return `${e.message} ${e.cause?.message ?? ''}`;
  }
  return 'did not throw';
}

describe('WeighingRecordRepository (migration 0004/0005, NFR-8)', () => {
  it('round-trips every field; quantities are stored as decimal text with a unit', () => {
    const { repo, db } = setup();
    repo.append(record(3, '94.2'));
    expect(repo.findBySessionAndSequence('S-1', 3)).toEqual(record(3, '94.2'));
    const row = db.all<Record<string, string | null>>(sql`select * from weighing_records`)[0]!;
    expect(row).toMatchObject({
      actual_value: '94.2',
      actual_unit: 'g',
      target_value: '94.0',
      tol_lower_value: '93.5',
      tol_upper_value: '94.5',
      tare_value: '214.0',
      lot_id: '2026-0387',
      container_id: 'C-12',
      scale_id: 'scale-3kg',
      operator_id: 'OP-0417',
      result: 'IN_TOLERANCE',
      surplus_value: null,
    });
  });

  it('lists the records of a session in component order, whatever the insertion order', () => {
    const { repo } = setup();
    repo.append(record(3));
    repo.append(record(1));
    repo.append(record(2));
    expect(repo.listBySession('S-1').map((r) => r.sequence)).toEqual([1, 2, 3]);
    expect(repo.listBySession('S-other')).toEqual([]);
    expect(repo.findBySessionAndSequence('S-1', 9)).toBeUndefined();
  });

  it('a surplus (bolt 012) round-trips', () => {
    const { repo } = setup();
    repo.append({
      ...record(1, '96.4'),
      surplus: { amount: { value: '2.4', unit: 'g' }, percent: '2.6' },
    });
    expect(repo.findBySessionAndSequence('S-1', 1)!.surplus).toEqual({
      amount: { value: '2.4', unit: 'g' },
      percent: '2.6',
    });
  });

  it('a second record for the same component is impossible (unique session + sequence)', () => {
    const { repo } = setup();
    repo.append(record(1));
    expect(failure(() => repo.append({ ...record(1), recordId: 'R-dup' }))).toMatch(
      /UNIQUE|unique/,
    );
    expect(repo.listBySession('S-1')).toHaveLength(1);
  });

  it('the database refuses any UPDATE of a record (trigger)', () => {
    const { repo, db } = setup();
    repo.append(record(1));
    expect(failure(() => db.run(sql`update weighing_records set actual_value = '1.0'`))).toMatch(
      /immutable/,
    );
    expect(failure(() => db.run(sql`update weighing_records set result = 'OVERRIDDEN'`))).toMatch(
      /immutable/,
    );
    expect(repo.findBySessionAndSequence('S-1', 1)!.actual.value).toBe('94.2');
  });

  it('the database refuses any DELETE of a record (trigger)', () => {
    const { repo, db } = setup();
    repo.append(record(1));
    expect(failure(() => db.run(sql`delete from weighing_records`))).toMatch(/immutable/);
    expect(repo.listBySession('S-1')).toHaveLength(1);
  });

  it('the repository has no update or delete method', () => {
    const { repo } = setup();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter(
      (m) => m !== 'constructor',
    );
    expect(methods.sort()).toEqual(['append', 'findBySessionAndSequence', 'listBySession']);
  });

  it('a record needs an existing session and operator (foreign keys)', () => {
    const { repo } = setup();
    expect(failure(() => repo.append({ ...record(1), sessionId: 'nope' }))).toMatch(/FOREIGN KEY/i);
    expect(failure(() => repo.append({ ...record(1), operatorId: 'OP-nobody' }))).toMatch(
      /FOREIGN KEY/i,
    );
  });
});

describe('session persistence of the new states', () => {
  it('SUSPENDED and COMPLETED sessions round-trip with completedAt', () => {
    const opened = openWeighingDb(':memory:');
    close = opened.close;
    seedOperatorsIfEmpty(opened.db, readStationSeed(path.resolve('data/seed/station-seed.json')));
    const repo = new DrizzleWeighingSessionRepository(opened.db);
    const s = WeighingSession.start({
      sessionId: 'S-2',
      batchId: 'B-24188',
      stationId: 'STN-01',
      startedBy: 'OP-0417',
      recipe: {
        recipeId: 'R',
        version: '1',
        shade: 'x',
        components: [spec(1)],
        takenAt: T0.toISOString(),
      },
      now: T0,
    });
    s.suspend(T0);
    repo.save(s);
    expect(repo.findById('S-2')!.status).toBe('SUSPENDED');
    expect(repo.findOpenByBatch('B-24188')?.sessionId).toBe('S-2'); // suspended sessions are open
    expect(repo.findInProgressForStation('STN-01')).toBeUndefined();
    s.resume(T0);
    repo.save(s);
    expect(repo.findInProgressForStation('STN-01')?.sessionId).toBe('S-2');
  });

  it('a COMPLETED session keeps completedAt and drops out of the open sessions', () => {
    const opened = openWeighingDb(':memory:');
    close = opened.close;
    seedOperatorsIfEmpty(opened.db, readStationSeed(path.resolve('data/seed/station-seed.json')));
    const repo = new DrizzleWeighingSessionRepository(opened.db);
    const s = WeighingSession.start({
      sessionId: 'S-3',
      batchId: 'B-24189',
      stationId: 'STN-01',
      startedBy: 'OP-0417',
      recipe: {
        recipeId: 'R',
        version: '1',
        shade: 'x',
        components: [spec(1)],
        takenAt: T0.toISOString(),
      },
      now: T0,
    });
    s.assignScale(
      1,
      { scaleId: 'scale-3kg', mode: 'AUTO', reason: null, requirement: { value: '1', unit: 'g' } },
      T0,
    );
    s.verifyIdentity(1, 'DYE-0001', T0);
    s.setLot(1, { lotId: '2026-0387', source: 'DEFAULT' }, T0);
    s.setContainer(
      1,
      { containerId: 'C-12', tare: { value: '214.0', unit: 'g' }, source: 'DEFAULT' },
      T0,
    );
    s.applyTare(1, { value: '214.0', unit: 'g' }, T0);
    s.confirm(1, T0);
    repo.save(s);
    const loaded = repo.findById('S-3')!;
    expect(loaded.status).toBe('COMPLETED');
    expect(loaded.snapshot().completedAt).toBe(T0.toISOString());
    expect(loaded.snapshot().components[0]).toMatchObject({
      state: 'DONE',
      scale: null,
      preparation: null,
    });
    expect(repo.findOpenByBatch('B-24189')).toBeUndefined();
  });
});

describe('override columns and their consistency trigger (migration 0006/0007, ADR-9)', () => {
  const overridden = (patch: Partial<WeighingRecord> = {}): WeighingRecord => ({
    ...record(1, '96.4'),
    result: 'OVERRIDDEN',
    surplus: { amount: { value: '2.4', unit: 'g' }, percent: '2.6' },
    override: {
      supervisorId: 'OP-0901',
      reason: 'Customer approved',
      zone: 'OVER',
      authorisedAt: T0.toISOString(),
    },
    ...patch,
  });
  const MESSAGE = /override must be complete/;

  it('an overridden record round-trips with its override', () => {
    const { repo } = setup();
    repo.append(overridden());
    const read = repo.findBySessionAndSequence('S-1', 1)!;
    expect(read.result).toBe('OVERRIDDEN');
    expect(read.override).toEqual({
      supervisorId: 'OP-0901',
      reason: 'Customer approved',
      zone: 'OVER',
      authorisedAt: T0.toISOString(),
    });
    expect(read).toEqual(overridden());
  });

  it('an ordinary record has null override columns', () => {
    const { repo, db } = setup();
    repo.append(record(1));
    const row = db.all<Record<string, unknown>>(sql`select * from weighing_records`)[0]!;
    expect(row).toMatchObject({
      override_supervisor_id: null,
      override_reason: null,
      override_zone: null,
      override_at: null,
    });
  });

  it.each([
    ['OVERRIDDEN without an override', { override: null }],
    ['an override on an IN_TOLERANCE record', { result: 'IN_TOLERANCE' as const }],
  ])('refuses %s', (_name, patch) => {
    const { repo } = setup();
    expect(failure(() => repo.append(overridden(patch)))).toMatch(MESSAGE);
    expect(repo.listBySession('S-1')).toEqual([]);
  });

  it.each([
    ['an empty reason', { reason: '' }],
    ['a blank reason', { reason: '   ' }],
    ['an unknown zone', { zone: 'OK' as never }],
  ])('refuses an override with %s', (_name, change) => {
    const { repo } = setup();
    const base = overridden();
    expect(
      failure(() => repo.append({ ...base, override: { ...base.override!, ...change } })),
    ).toMatch(MESSAGE);
  });

  it('refuses a supervisor that is not an operator (foreign key)', () => {
    const { repo } = setup();
    const base = overridden();
    expect(
      failure(() =>
        repo.append({ ...base, override: { ...base.override!, supervisorId: 'OP-nobody' } }),
      ),
    ).toMatch(/FOREIGN KEY/i);
  });

  it('refuses stray override columns on a record without a supervisor (raw SQL)', () => {
    const { repo, db } = setup();
    repo.append(record(1));
    expect(
      failure(() =>
        db.run(sql`insert into weighing_records select
          'R-raw', session_id, batch_id, 2, dyestuff_code, dyestuff_name, actual_value, actual_unit,
          target_value, target_unit, tol_lower_value, tol_lower_unit, tol_upper_value, tol_upper_unit,
          lot_id, container_id, tare_value, tare_unit, scale_id, operator_id, confirmed_at, 'IN_TOLERANCE',
          null, null, null, null, 'stray reason', null, null from weighing_records`),
      ),
    ).toMatch(MESSAGE);
  });

  it('an overridden record is as immutable as any other', () => {
    const { repo, db } = setup();
    repo.append(overridden());
    expect(
      failure(() => db.run(sql`update weighing_records set override_reason = 'changed'`)),
    ).toMatch(/immutable/);
    expect(failure(() => db.run(sql`delete from weighing_records`))).toMatch(/immutable/);
    expect(repo.findBySessionAndSequence('S-1', 1)!.override!.reason).toBe('Customer approved');
  });
});
