import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openWeighingDb } from '../../../db/weighingms/db';
import { auditEvents } from '../../../db/weighingms/schema';
import { WeighingSession } from '../domain/weighing-session';
import {
  DrizzleAuditEventRepository,
  DrizzleOperatorRepository,
  DrizzleStationRepository,
  DrizzleWeighingSessionRepository,
} from './drizzle-repositories';
import { hashPin, verifyPin } from './pin-hash';
import { readStationSeed, seedOperatorsIfEmpty } from './seed';

const SEED = path.resolve('data/seed/station-seed.json');

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
let close: (() => void) | undefined;
afterEach(() => close?.());

function seeded() {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  seedOperatorsIfEmpty(opened.db, readStationSeed(SEED));
  return opened.db;
}

const session = (id: string, batchId: string) =>
  WeighingSession.start({
    sessionId: id,
    batchId,
    stationId: 'STN-01',
    startedBy: 'OP-0417',
    recipe: {
      recipeId: 'R',
      version: '1',
      shade: 'Teal 4C',
      components: [1, 2].map((sequence) => ({
        sequence,
        dyestuff: {
          code: `D${sequence}`,
          name: 'n',
          shortName: 's',
          colourHex: '#000',
          type: 'DYE',
        },
        target: { value: '94.0', unit: 'g' as const },
        tolerance: { value: '0.5', unit: 'g' as const },
        barMax: { value: '125', unit: 'g' as const },
        suggestedLotId: null,
      })),
      takenAt: '2026-10-16T07:00:00.000Z',
    },
    now: new Date('2026-10-16T07:00:00Z'),
  });

describe('PIN hashing (NFR-14)', () => {
  it('verifies the right PIN, rejects a wrong or missing one, and never stores the PIN', () => {
    const h = hashPin('2580');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(h).not.toContain('2580');
    expect(verifyPin('2580', h)).toBe(true);
    expect(verifyPin('1234', h)).toBe(false);
    expect(verifyPin('2580', null)).toBe(false);
    expect(verifyPin('2580', 'garbage')).toBe(false);
  });

  it('uses a random salt (same PIN, different hashes)', () => {
    expect(hashPin('2580')).not.toBe(hashPin('2580'));
  });

  it('the seeded supervisor PIN is the documented training PIN', () => {
    const sup = readStationSeed(SEED).operators.find((o) => o.role === 'SUPERVISOR');
    expect(verifyPin('2580', sup?.pinHash ?? null)).toBe(true);
  });
});

describe('Station seed (DB-5)', () => {
  it('seeds three operators once; R. Karim, the supervisor and the inactive badge', () => {
    const db = seeded();
    const ops = new DrizzleOperatorRepository(db);
    expect(ops.findByBadge('BDG-0417')).toMatchObject({
      name: 'R. Karim',
      shift: 'Shift A',
      role: 'OPERATOR',
      active: true,
    });
    expect(ops.findByBadge('BDG-0901')).toMatchObject({ role: 'SUPERVISOR', active: true });
    expect(ops.findByBadge('BDG-0999')).toMatchObject({ active: false });
    expect(seedOperatorsIfEmpty(db, readStationSeed(SEED))).toBe(false);
  });
});

describe('Drizzle repositories', () => {
  it('station: set, read and clear the current operator', () => {
    const station = new DrizzleStationRepository(seeded());
    expect(station.currentOperatorId('STN-01')).toBeNull();
    station.setCurrentOperator('STN-01', 'OP-0417', '2026-10-16T07:00:00.000Z');
    expect(station.currentOperatorId('STN-01')).toBe('OP-0417');
    station.setCurrentOperator('STN-01', null, '2026-10-16T07:01:00.000Z');
    expect(station.currentOperatorId('STN-01')).toBeNull();
  });

  it('sessions: save and reload the whole aggregate; find open by batch and in progress for station', () => {
    const repo = new DrizzleWeighingSessionRepository(seeded());
    const s = session('S-1', 'B-24187');
    repo.save(s);
    s.activate(2, new Date('2026-10-16T07:01:00Z'));
    repo.save(s);
    const loaded = repo.findById('S-1')!;
    expect(loaded.snapshot()).toEqual(s.snapshot());
    expect(repo.findOpenByBatch('B-24187')?.sessionId).toBe('S-1');
    expect(repo.findInProgressForStation('STN-01')?.sessionId).toBe('S-1');
    expect(repo.findOpenByBatch('B-24188')).toBeUndefined();
  });

  it('the database refuses a second open session for the same batch', () => {
    const repo = new DrizzleWeighingSessionRepository(seeded());
    repo.save(session('S-1', 'B-24187'));
    expect(() => repo.save(session('S-2', 'B-24187'))).toThrow();
  });

  it('audit: append and list in order; UPDATE and DELETE are aborted by the database (ADR-1)', () => {
    const db = seeded();
    new DrizzleWeighingSessionRepository(db).save(session('S-1', 'B-24187'));
    const audit = new DrizzleAuditEventRepository(db);
    audit.append({
      eventId: 'E2',
      sessionId: 'S-1',
      type: 'REPRINT',
      actorId: 'OP-0417',
      detail: { n: 2 },
      occurredAt: '2026-10-16T07:02:00.000Z',
    });
    audit.append({
      eventId: 'E1',
      sessionId: 'S-1',
      type: 'OVERRIDE',
      actorId: 'OP-0901',
      detail: { reason: 'x' },
      occurredAt: '2026-10-16T07:01:00.000Z',
    });
    expect(audit.listBySession('S-1').map((e) => [e.eventId, e.type, e.detail])).toEqual([
      ['E1', 'OVERRIDE', { reason: 'x' }],
      ['E2', 'REPRINT', { n: 2 }],
    ]);
    expect(failure(() => db.update(auditEvents).set({ type: 'ABANDON' }).run())).toMatch(
      /immutable/,
    );
    expect(failure(() => db.delete(auditEvents).run())).toMatch(/immutable/);
    expect(failure(() => db.run(sql`DELETE FROM audit_events WHERE event_id = 'E1'`))).toMatch(
      /immutable/,
    );
    expect(audit.listBySession('S-1')).toHaveLength(2);
  });

  it('events with the same timestamp keep their insertion order (regression: random IDs)', () => {
    const db = seeded();
    new DrizzleWeighingSessionRepository(db).save(session('S-1', 'B-24187'));
    const audit = new DrizzleAuditEventRepository(db);
    const at = '2026-10-16T07:00:00.000Z';
    for (const id of ['Z', 'M', 'A']) {
      audit.append({
        eventId: id,
        sessionId: 'S-1',
        type: 'REPRINT',
        actorId: 'OP-0417',
        detail: {},
        occurredAt: at,
      });
    }
    expect(audit.listBySession('S-1').map((e) => e.eventId)).toEqual(['Z', 'M', 'A']);
  });

  it('the repository API offers no way to update or delete audit events', () => {
    const audit = new DrizzleAuditEventRepository(seeded()) as unknown as Record<string, unknown>;
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(audit)).sort()).toEqual([
      'append',
      'constructor',
      'listBySession',
    ]);
  });
});
