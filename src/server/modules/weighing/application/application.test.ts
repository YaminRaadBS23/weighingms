import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecipeResponse } from '../../../../shared/batches';
import { openWeighingDb } from '../../../db/weighingms/db';
import { BatchNotReleasedError, OrgatexUnavailableError } from '../../../errors';
import type { OrgatexPort } from '../../../integrations/orgatex/orgatex-port';
import type { BatchService } from '../../batches/batch-service';
import { readStationSeed, seedOperatorsIfEmpty } from '../infrastructure/seed';
import { createWeighingModule } from '../module';

const quiet = { info: () => {}, warn: () => {} };
let close: (() => void) | undefined;
afterEach(() => close?.());

const RECIPE: RecipeResponse = {
  batchId: 'B-24187',
  recipeId: 'RCP-TEAL-4C',
  shade: 'Teal 4C',
  version: '1',
  components: [1, 2, 3, 4, 5].map((sequence) => ({
    sequence,
    dyestuff: {
      code: `D-${sequence}`,
      name: `Dye ${sequence}`,
      shortName: `D${sequence}`,
      colourHex: '#000',
      type: 'DYE',
    },
    target: { value: '94.0', unit: 'g' },
    tolerance: { value: '0.5', unit: 'g' },
    barMax: { value: '125', unit: 'g' },
    suggestedLotId: null,
  })),
};

interface Fakes {
  notWeighable?: string[];
  statusFailure?: Error;
}

function setup(fakes: Fakes = {}) {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  seedOperatorsIfEmpty(opened.db, readStationSeed(path.resolve('data/seed/station-seed.json')));
  const calls = { requireWeighable: [] as string[], setBatchStatus: [] as string[] };
  const batches = {
    async requireWeighable(id: string) {
      calls.requireWeighable.push(id);
      if (fakes.notWeighable?.includes(id))
        throw new BatchNotReleasedError(id, 'Not released by OrgaTEX');
      return {};
    },
    async getRecipe(id: string) {
      return { ...RECIPE, batchId: id };
    },
  } as unknown as BatchService;
  const orgatex = {
    async setBatchStatus(id: string, status: string) {
      calls.setBatchStatus.push(`${id}:${status}`);
      if (fakes.statusFailure) throw fakes.statusFailure;
    },
  } as unknown as OrgatexPort;
  let n = 0;
  const w = createWeighingModule({
    db: opened.db,
    stationId: 'STN-01',
    batches,
    orgatex,
    logger: quiet,
    now: () => new Date('2026-10-16T07:00:00Z'),
    newId: () => `ID-${++n}`,
  });
  return { w, calls };
}

describe('OperatorIdentification', () => {
  it('signs in by badge (normalised), reports the current operator and signs out', () => {
    const { w } = setup();
    expect(w.identification.current()).toBeNull();
    expect(w.identification.signIn(' bdg-0417 ').name).toBe('R. Karim');
    expect(w.identification.current()?.operatorId).toBe('OP-0417');
    w.identification.signOut();
    expect(w.identification.current()).toBeNull();
  });

  it.each(['BDG-0999', 'BDG-1234', 'B-24187', ''])('refuses %o with OPERATOR_UNKNOWN', (badge) => {
    const { w } = setup();
    expect(() => w.identification.signIn(badge)).toThrow(
      expect.objectContaining({ code: 'OPERATOR_UNKNOWN', httpStatus: 401 }),
    );
    expect(w.identification.current()).toBeNull();
  });

  it('a new sign-in replaces the previous operator', () => {
    const { w } = setup();
    w.identification.signIn('BDG-0417');
    w.identification.signIn('BDG-0901');
    expect(w.identification.current()?.role).toBe('SUPERVISOR');
  });
});

describe('SessionStarter', () => {
  it('requires a signed-in operator (NOT_SIGNED_IN) before anything else', async () => {
    const { w, calls } = setup();
    await expect(w.starter.startOrResume('B-24187')).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
      httpStatus: 401,
    });
    expect(calls.requireWeighable).toEqual([]);
  });

  it('starts a new session: snapshot, component 1 active, OrgaTEX set to WEIGHING, persisted', async () => {
    const { w, calls } = setup();
    w.identification.signIn('BDG-0417');
    const { session, resumed } = await w.starter.startOrResume('b-24187');
    expect(resumed).toBe(false);
    expect(session.batchId).toBe('B-24187');
    expect(session.snapshot().recipe.components).toHaveLength(5);
    expect(session.activeSequence).toBe(1);
    expect(session.snapshot().startedBy).toBe('OP-0417');
    expect(calls.setBatchStatus).toEqual(['B-24187:WEIGHING']);
    expect(w.ctx.sessions.findById(session.sessionId)?.snapshot()).toEqual(session.snapshot());
  });

  it('resumes the open session of the same batch without calling OrgaTEX', async () => {
    const { w, calls } = setup();
    w.identification.signIn('BDG-0417');
    const first = await w.starter.startOrResume('B-24187');
    const again = await w.starter.startOrResume('B-24187');
    expect(again).toMatchObject({ resumed: true });
    expect(again.session.sessionId).toBe(first.session.sessionId);
    expect(calls.requireWeighable).toEqual(['B-24187']);
    expect(calls.setBatchStatus).toHaveLength(1);
  });

  it('refuses another batch while one is in progress (SESSION_IN_PROGRESS, ADR-3)', async () => {
    const { w } = setup();
    w.identification.signIn('BDG-0417');
    const first = await w.starter.startOrResume('B-24187');
    await expect(w.starter.startOrResume('B-24188')).rejects.toMatchObject({
      code: 'SESSION_IN_PROGRESS',
      httpStatus: 409,
      details: { sessionId: first.session.sessionId, batchId: 'B-24187' },
    });
  });

  it('passes the release check refusal through (BATCH_NOT_RELEASED) and creates nothing', async () => {
    const { w } = setup({ notWeighable: ['B-24190'] });
    w.identification.signIn('BDG-0417');
    await expect(w.starter.startOrResume('B-24190')).rejects.toMatchObject({
      code: 'BATCH_NOT_RELEASED',
    });
    expect(w.ctx.sessions.findInProgressForStation('STN-01')).toBeUndefined();
  });

  it('OrgaTEX unreachable when setting WEIGHING: the session still starts, marked DEFERRED (TD-1)', async () => {
    const { w } = setup({ statusFailure: new OrgatexUnavailableError('down') });
    w.identification.signIn('BDG-0417');
    const { session } = await w.starter.startOrResume('B-24187');
    expect(session.snapshot().orgatexStatusSync).toBe('DEFERRED');
    expect(w.ctx.sessions.findById(session.sessionId)?.snapshot().orgatexStatusSync).toBe(
      'DEFERRED',
    );
  });

  it('a concurrent start of the same batch resumes the winner instead of failing', async () => {
    const { w } = setup();
    w.identification.signIn('BDG-0417');
    const [a, b] = await Promise.all([
      w.starter.startOrResume('B-24187'),
      w.starter.startOrResume('B-24187'),
    ]);
    expect(a.session.sessionId).toBe(b.session.sessionId);
    expect([a.resumed, b.resumed].sort()).toEqual([false, true]);
  });
});

describe('ComponentActivation and AuditLog', () => {
  it('activates and persists; unknown session → SESSION_NOT_FOUND', async () => {
    const { w } = setup();
    w.identification.signIn('BDG-0417');
    const { session } = await w.starter.startOrResume('B-24187');
    expect(w.activation.activate(session.sessionId, 3).activeSequence).toBe(3);
    expect(w.ctx.sessions.findById(session.sessionId)?.activeSequence).toBe(3);
    expect(() => w.activation.activate('nope', 1)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
    );
  });

  it('records exactly one event per call and lists them in order', async () => {
    const { w } = setup();
    w.identification.signIn('BDG-0417');
    const { session } = await w.starter.startOrResume('B-24187');
    w.auditLog.record('ABANDON', 'OP-0417', session.sessionId, { sequence: 3 });
    w.auditLog.record('OVERRIDE', 'OP-0901', session.sessionId, { reason: 'test' });
    expect(w.auditLog.listForSession(session.sessionId).map((e) => [e.type, e.actorId])).toEqual([
      ['ABANDON', 'OP-0417'],
      ['OVERRIDE', 'OP-0901'],
    ]);
  });
});
