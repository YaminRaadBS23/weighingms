/**
 * Confirmation, completion, re-tare, quit and resume with a fake scale (ddd-01/02, ADR-7, ADR-8).
 * Real SQLite (in memory), real MaterialService, fake ScalePort and OrgaTEX port.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  NOW,
  PAST,
  closeDb,
  confirmOnTarget,
  current,
  g,
  kg,
  started,
  states,
  unlock,
  weigh,
  type T,
} from './confirmation-test-support';

afterEach(closeDb);

describe('confirm — the record (story 009, FR-19)', () => {
  it('Yellow 94.2 g stable: a record with every field is written and the component is DONE', async () => {
    const t = await started();
    await confirmOnTarget(t, 1);
    await confirmOnTarget(t, 2);
    await unlock(t, 3);
    const { record, session } = await weigh(t, 3, g('94.2'));
    expect(record).toEqual({
      recordId: record.recordId,
      sessionId: t.sid,
      batchId: 'B-24187',
      sequence: 3,
      dyestuffCode: 'DYE-4471',
      dyestuffName: 'Yellow',
      actual: g('94.2'),
      target: g('94.0'),
      toleranceLower: g('93.5'),
      toleranceUpper: g('94.5'),
      lotId: '2026-0387',
      containerId: 'C-12',
      tare: g('214.0'),
      scaleId: 'scale-3kg',
      operatorId: 'OP-0417',
      confirmedAt: NOW.toISOString(),
      result: 'IN_TOLERANCE',
      surplus: null,
      override: null,
    });
    expect(t.w.ctx.records.findBySessionAndSequence(t.sid, 3)).toEqual(record);
    expect(states(t, t.sid)).toEqual(['DONE', 'DONE', 'DONE', 'ACTIVE', 'PENDING']);
    expect(session.activeSequence).toBe(4);
  });

  it('uses the scanned lot and container, and the tare the scale reported', async () => {
    const t = await started();
    await unlock(t, 1);
    t.w.ctx.sessions.findById(t.sid); // untouched
    await t.w.preparation.setContainer(t.sid, 1, 'C-11');
    t.scales.nextTare = g('214.2');
    await t.w.preparation.setContainer(t.sid, 1, 'C-12');
    const { record } = await weigh(t, 1, g('1240.0'));
    expect(record).toMatchObject({ containerId: 'C-12', tare: g('214.2'), lotId: '2026-0341' });
  });

  it('records the weight as measured, in the scale’s unit (a g component weighed on the kg scale)', async () => {
    const t = await started();
    t.scales.set('scale-3kg', { calibrationDueAt: PAST });
    await unlock(t, 1);
    expect(current(t, t.sid).snapshot().components[0]!.scale!.scaleId).toBe('scale-32kg');
    const { record } = await weigh(t, 1, kg('1.241'));
    expect(record).toMatchObject({
      actual: kg('1.241'),
      target: g('1240.0'),
      toleranceLower: g('1234'),
      scaleId: 'scale-32kg',
    });
  });

  it('reads the scale exactly once and ignores the operator’s display (ADR-7)', async () => {
    const t = await started();
    await unlock(t, 1);
    const before = t.scales.reads;
    await weigh(t, 1, g('1240.0'));
    expect(t.scales.reads - before).toBe(1);
    expect(t.w.confirmation.confirm.length).toBe(2); // (sessionId, sequence): there is no weight parameter
  });

  it('the operator on the record is the operator signed in at confirmation (ADR-2)', async () => {
    const t = await started();
    await unlock(t, 1);
    t.w.identification.signIn('BDG-0901');
    const { record } = await weigh(t, 1, g('1240.0'));
    expect(record.operatorId).toBe('OP-0901');
  });
});

describe('confirm — refusals write nothing (story 008/009, FR-18)', () => {
  const noRecord = (t: T & { sid: string }) => {
    expect(t.w.ctx.records.listBySession(t.sid)).toEqual([]);
    expect(states(t, t.sid)[0]).toBe('ACTIVE');
  };

  it.each([
    ['0.0', 'UNDER'],
    ['1115.9', 'UNDER'],
    ['1116.0', 'NEAR'],
    ['1233.9', 'NEAR'],
    ['1246.1', 'OVER'],
    ['1500.0', 'OVER'],
  ])(
    'Blue at %s g → 422 TOLERANCE_VIOLATION (%s), details give weight and limits',
    async (w, zone) => {
      const t = await started();
      await unlock(t, 1);
      await expect(weigh(t, 1, g(w))).rejects.toMatchObject({
        code: 'TOLERANCE_VIOLATION',
        httpStatus: 422,
        details: { zone, weight: g(w), lower: g('1234'), upper: g('1246') },
      });
      noRecord(t);
    },
  );

  it.each(['1234.0', '1240.0', '1246.0'])(
    'Blue at %s g (boundaries and target) is accepted',
    async (w) => {
      const t = await started();
      await unlock(t, 1);
      await expect(weigh(t, 1, g(w))).resolves.toMatchObject({ record: { actual: g(w) } });
    },
  );

  it('an unstable reading → 409 READING_UNSTABLE', async () => {
    const t = await started();
    await unlock(t, 1);
    await expect(weigh(t, 1, g('1240.0'), false)).rejects.toMatchObject({
      code: 'READING_UNSTABLE',
      httpStatus: 409,
    });
    noRecord(t);
  });

  it('no reading (scale not responding) → 503 SCALE_UNAVAILABLE; disconnected scale info → 503', async () => {
    const t = await started();
    await unlock(t, 1);
    t.scales.readFails = true;
    await expect(weigh(t, 1, g('1240.0'))).rejects.toMatchObject({
      code: 'SCALE_UNAVAILABLE',
      httpStatus: 503,
    });
    t.scales.readFails = false;
    t.scales.set('scale-3kg', { connected: false });
    await expect(weigh(t, 1, g('1240.0'))).rejects.toMatchObject({ code: 'SCALE_UNAVAILABLE' });
    noRecord(t);
  });

  it('calibration expired after unlock → 422 SCALE_CALIBRATION_EXPIRED (carried from bolt 009)', async () => {
    const t = await started();
    await unlock(t, 1);
    t.scales.set('scale-3kg', { calibrationDueAt: PAST });
    await expect(weigh(t, 1, g('1240.0'))).rejects.toMatchObject({
      code: 'SCALE_CALIBRATION_EXPIRED',
      httpStatus: 422,
    });
    noRecord(t);
  });

  it('a locked component → 409 IDENTITY_NOT_VERIFIED, without reading the scale (carried from bolt 009)', async () => {
    const t = await started();
    const before = t.scales.reads;
    await expect(weigh(t, 1, g('1240.0'))).rejects.toMatchObject({
      code: 'IDENTITY_NOT_VERIFIED',
      httpStatus: 409,
    });
    expect(t.scales.reads).toBe(before);
  });

  it('not active / already done / unknown / not signed in / unknown session', async () => {
    const t = await started();
    await unlock(t, 1);
    await expect(weigh(t, 2, g('386.0'))).rejects.toMatchObject({ code: 'COMPONENT_NOT_ACTIVE' });
    await expect(weigh(t, 9, g('1.0'))).rejects.toMatchObject({ code: 'COMPONENT_NOT_FOUND' });
    await weigh(t, 1, g('1240.0'));
    await expect(weigh(t, 1, g('1240.0'))).rejects.toMatchObject({
      code: 'COMPONENT_ALREADY_DONE',
    });
    await expect(t.w.confirmation.confirm('nope', 1)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
    t.w.identification.signOut();
    await expect(weigh(t, 2, g('386.0'))).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
  });

  it('every refusal is logged with its reason', async () => {
    const t = await started();
    await unlock(t, 1);
    await weigh(t, 1, g('1500.0')).catch(() => undefined);
    expect(t.logs).toContainEqual(
      expect.objectContaining({ event: 'confirmation-refused', reason: 'TOLERANCE_VIOLATION' }),
    );
  });
});

describe('confirm — one atomic unit (invariant 17, NFR-5)', () => {
  it('if appending the record fails, the component stays ACTIVE', async () => {
    const t = await started();
    await unlock(t, 1);
    t.w.ctx.records.append = () => {
      throw new Error('disk full');
    };
    await expect(weigh(t, 1, g('1240.0'))).rejects.toThrow('disk full');
    expect(states(t, t.sid)[0]).toBe('ACTIVE');
    expect(current(t, t.sid).preparationState(1)).toBe('UNLOCKED');
  });

  it('if saving the session fails after the record was appended, the record is rolled back', async () => {
    const t = await started();
    await unlock(t, 1);
    t.w.ctx.sessions.save = () => {
      throw new Error('disk full');
    };
    await expect(weigh(t, 1, g('1240.0'))).rejects.toThrow('disk full');
    expect(t.w.ctx.records.listBySession(t.sid)).toEqual([]);
  });

  it('a double click is serialised: one record, the second request gets COMPONENT_ALREADY_DONE', async () => {
    const t = await started();
    await unlock(t, 1);
    t.scales.net = g('1240.0');
    const results = await Promise.allSettled([
      t.w.confirmation.confirm(t.sid, 1),
      t.w.confirmation.confirm(t.sid, 1),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({
      code: 'COMPONENT_ALREADY_DONE',
    });
    expect(t.w.ctx.records.listBySession(t.sid)).toHaveLength(1);
  });
});

describe('progression and completion (story 010, FR-25, FR-26, ADR-8)', () => {
  it('Blue → Red → Yellow → Sodium Sulphate → Soda Ash, each on its scale, then COMPLETED', async () => {
    const t = await started();
    const scalesUsed: string[] = [];
    for (let seq = 1; seq <= 5; seq++) {
      expect(current(t, t.sid).activeSequence).toBe(seq);
      const { record } = await confirmOnTarget(t, seq);
      scalesUsed.push(record.scaleId);
    }
    expect(scalesUsed).toEqual(['scale-3kg', 'scale-3kg', 'scale-3kg', 'scale-32kg', 'scale-32kg']);
    const done = current(t, t.sid);
    expect(done.status).toBe('COMPLETED');
    expect(done.snapshot().completedAt).toBe(NOW.toISOString());
    expect(t.w.ctx.records.listBySession(t.sid).map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(t.w.ctx.sessions.findInProgressForStation('STN-01')).toBeUndefined();
  });

  it('a completed batch resumes into its completed session; no second session is started (Confirm & print)', async () => {
    const t = await started();
    for (let seq = 1; seq <= 5; seq++) await confirmOnTarget(t, seq);
    const again = await t.w.starter.startOrResume('b-24187');
    expect(again.resumed).toBe(true);
    expect(again.session.sessionId).toBe(t.sid);
    expect(again.session.status).toBe('COMPLETED');
    expect(t.w.ctx.sessions.findInProgressForStation('STN-01')).toBeUndefined();
    expect(t.w.ctx.sessions.findCompletedByBatch('B-24187')?.sessionId).toBe(t.sid);
    expect(t.w.ctx.records.listBySession(t.sid)).toHaveLength(5);
  });

  it('the next component gets its scale at once (AUTO) and is locked', async () => {
    const t = await started();
    const { session } = await confirmOnTarget(t, 1);
    expect(session.snapshot().components[1]).toMatchObject({
      state: 'ACTIVE',
      scale: { scaleId: 'scale-3kg', mode: 'AUTO' },
    });
    expect(session.preparationState(2)).toBe('AWAITING_IDENTITY');
  });

  it('complete() with 4 of 5 done → 422 BATCH_INCOMPLETE; after the fifth it is idempotent', async () => {
    const t = await started();
    for (let seq = 1; seq <= 4; seq++) await confirmOnTarget(t, seq);
    await expect(t.w.confirmation.complete(t.sid)).rejects.toMatchObject({
      code: 'BATCH_INCOMPLETE',
      details: { done: 4, total: 5 },
    });
    await confirmOnTarget(t, 5);
    const again = await t.w.confirmation.complete(t.sid);
    expect(again.status).toBe('COMPLETED');
  });

  it('a completed session refuses component actions with SESSION_COMPLETED (409)', async () => {
    const t = await started();
    for (let seq = 1; seq <= 5; seq++) await confirmOnTarget(t, seq);
    await expect(t.w.preparation.verifyIdentity(t.sid, 5, 'AUX-0107')).rejects.toMatchObject({
      code: 'SESSION_COMPLETED',
      httpStatus: 409,
    });
    await expect(t.w.activation.activate(t.sid, 1)).rejects.toMatchObject({
      code: 'SESSION_COMPLETED',
    });
    await expect(t.w.retare.retare(t.sid, 5)).rejects.toMatchObject({ code: 'SESSION_COMPLETED' });
    await expect(t.w.suspension.quit(t.sid)).rejects.toMatchObject({ code: 'SESSION_COMPLETED' });
  });

  it('confirmation, completion and everything else here never call OrgaTEX (ADR-8, TD-1)', async () => {
    const t = await started();
    const afterStart = [...t.orgatexCalls];
    for (let seq = 1; seq <= 5; seq++) await confirmOnTarget(t, seq);
    await t.w.confirmation.complete(t.sid);
    expect(t.orgatexCalls).toEqual(afterStart);
    expect(afterStart).toEqual(['setBatchStatus:B-24187:WEIGHING']);
  });

  it('after completion the batch can be seen again but not restarted as a new session', async () => {
    const t = await started();
    for (let seq = 1; seq <= 5; seq++) await confirmOnTarget(t, seq);
    expect(t.w.ctx.sessions.findOpenByBatch('B-24187')).toBeUndefined();
  });
});

describe('re-tare (story 011, FR-23)', () => {
  it('re-zeroes the scale, replaces the recorded tare, writes no record, and uses no container hint', async () => {
    const t = await started();
    await unlock(t, 1);
    t.scales.nextTare = g('264.0');
    const session = await t.w.retare.retare(t.sid, 1);
    expect(session.snapshot().components[0]!.preparation!.tareApplied).toEqual(g('264.0'));
    expect(t.scales.tares.at(-1)).toEqual({ scaleId: 'scale-3kg' });
    expect(t.w.ctx.records.listBySession(t.sid)).toEqual([]);
    const { record } = await weigh(t, 1, g('1240.0'));
    expect(record.tare).toEqual(g('264.0'));
  });

  it('never touches confirmed components', async () => {
    const t = await started();
    const { record } = await confirmOnTarget(t, 1);
    await unlock(t, 2);
    await t.w.retare.retare(t.sid, 2);
    expect(t.w.ctx.records.findBySessionAndSequence(t.sid, 1)).toEqual(record);
    await expect(t.w.retare.retare(t.sid, 1)).rejects.toMatchObject({
      code: 'COMPONENT_ALREADY_DONE',
      httpStatus: 409,
    });
  });

  it('a locked component → IDENTITY_NOT_VERIFIED; a pending one → COMPONENT_NOT_ACTIVE; no operator → NOT_SIGNED_IN', async () => {
    const t = await started();
    await expect(t.w.retare.retare(t.sid, 1)).rejects.toMatchObject({
      code: 'IDENTITY_NOT_VERIFIED',
    });
    await expect(t.w.retare.retare(t.sid, 3)).rejects.toMatchObject({
      code: 'COMPONENT_NOT_ACTIVE',
    });
    t.w.identification.signOut();
    await expect(t.w.retare.retare(t.sid, 1)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
  });

  it('scale unavailable → 503 and the state is unchanged; expired → 422', async () => {
    const t = await started();
    await unlock(t, 1);
    const before = current(t, t.sid).snapshot();
    t.scales.tareFails = true;
    await expect(t.w.retare.retare(t.sid, 1)).rejects.toMatchObject({
      code: 'SCALE_UNAVAILABLE',
      httpStatus: 503,
    });
    expect(current(t, t.sid).snapshot()).toEqual(before);
    t.scales.tareFails = false;
    t.scales.set('scale-3kg', { calibrationDueAt: PAST });
    await expect(t.w.retare.retare(t.sid, 1)).rejects.toMatchObject({
      code: 'SCALE_CALIBRATION_EXPIRED',
    });
  });
});

describe('quit and resume (story 012, FR-24, TD-14)', () => {
  it('quit mid-batch: SUSPENDED, the unconfirmed component back to PENDING, DONE records kept, one ABANDON audit event with the weight', async () => {
    const t = await started();
    await confirmOnTarget(t, 1);
    await confirmOnTarget(t, 2);
    await unlock(t, 3);
    t.scales.net = g('50.0');
    const session = await t.w.suspension.quit(t.sid);
    expect(session.status).toBe('SUSPENDED');
    expect(states(t, t.sid)).toEqual(['DONE', 'DONE', 'PENDING', 'PENDING', 'PENDING']);
    expect(t.w.ctx.records.listBySession(t.sid).map((r) => r.sequence)).toEqual([1, 2]);
    const events = t.w.auditLog.listForSession(t.sid);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'ABANDON',
      actorId: 'OP-0417',
      detail: { sequence: 3, dyestuffCode: 'DYE-4471', weight: g('50.0'), doneCount: 2 },
    });
  });

  it('quit with nothing weighed is allowed; the audit event records no weight', async () => {
    const t = await started();
    await t.w.suspension.quit(t.sid);
    expect(t.w.auditLog.listForSession(t.sid)[0]).toMatchObject({
      type: 'ABANDON',
      detail: { sequence: 1, weight: null, doneCount: 0 },
    });
  });

  it('quit works with a dead scale (weight unknown)', async () => {
    const t = await started();
    await unlock(t, 1);
    t.scales.readFails = true;
    await t.w.suspension.quit(t.sid);
    expect(t.w.auditLog.listForSession(t.sid)[0]!.detail).toMatchObject({ weight: null });
  });

  it('quit and its audit event are one transaction: if the audit write fails, the session stays IN_PROGRESS', async () => {
    const t = await started();
    t.w.ctx.audit.append = () => {
      throw new Error('disk full');
    };
    await expect(t.w.suspension.quit(t.sid)).rejects.toThrow('disk full');
    expect(current(t, t.sid).status).toBe('IN_PROGRESS');
  });

  it('quit twice → SESSION_NOT_IN_PROGRESS; no operator → NOT_SIGNED_IN; unknown session → SESSION_NOT_FOUND', async () => {
    const t = await started();
    await t.w.suspension.quit(t.sid);
    await expect(t.w.suspension.quit(t.sid)).rejects.toMatchObject({
      code: 'SESSION_NOT_IN_PROGRESS',
    });
    t.w.identification.signOut();
    await expect(t.w.suspension.quit(t.sid)).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    t.w.identification.signIn('BDG-0417');
    await expect(t.w.suspension.quit('nope')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('component actions on a suspended session → SESSION_NOT_IN_PROGRESS', async () => {
    const t = await started();
    await t.w.suspension.quit(t.sid);
    await expect(t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180')).rejects.toMatchObject({
      code: 'SESSION_NOT_IN_PROGRESS',
    });
    await expect(t.w.confirmation.confirm(t.sid, 1)).rejects.toMatchObject({
      code: 'SESSION_NOT_IN_PROGRESS',
    });
  });

  it('starting the batch again resumes: Blue and Red DONE with their records, Yellow ACTIVE and locked with a fresh scale', async () => {
    const t = await started();
    await confirmOnTarget(t, 1);
    await confirmOnTarget(t, 2);
    await unlock(t, 3);
    await t.w.suspension.quit(t.sid);
    const { session, resumed } = await t.w.starter.startOrResume('B-24187');
    expect(resumed).toBe(true);
    expect(session.sessionId).toBe(t.sid);
    expect(session.status).toBe('IN_PROGRESS');
    expect(states(t, t.sid)).toEqual(['DONE', 'DONE', 'ACTIVE', 'PENDING', 'PENDING']);
    expect(session.preparationState(3)).toBe('AWAITING_IDENTITY');
    expect(session.snapshot().components[2]!.scale).toMatchObject({
      scaleId: 'scale-3kg',
      mode: 'AUTO',
    });
    expect(t.w.ctx.records.listBySession(t.sid)).toHaveLength(2);
    expect(t.w.ctx.sessions.findInProgressForStation('STN-01')?.sessionId).toBe(t.sid);
  });

  it('a resumed component can be unlocked and the batch finished', async () => {
    const t = await started();
    await confirmOnTarget(t, 1);
    await t.w.suspension.quit(t.sid);
    await t.w.starter.startOrResume('B-24187');
    for (let seq = 2; seq <= 5; seq++) await confirmOnTarget(t, seq);
    expect(current(t, t.sid).status).toBe('COMPLETED');
  });

  it('resume works while OrgaTEX is offline (no OrgaTEX call)', async () => {
    const t = await started();
    await t.w.suspension.quit(t.sid);
    const before = [...t.orgatexCalls];
    await t.w.starter.startOrResume('B-24187');
    expect(t.orgatexCalls).toEqual(before);
  });

  it('resume is refused while another batch is in progress (ADR-3); the suspended session stays suspended', async () => {
    const t = await started();
    await t.w.suspension.quit(t.sid);
    const other = (await t.w.starter.startOrResume('B-24188')).session;
    await expect(t.w.starter.startOrResume('B-24187')).rejects.toMatchObject({
      code: 'SESSION_IN_PROGRESS',
      details: { sessionId: other.sessionId, batchId: 'B-24188' },
    });
    expect(current(t, t.sid).status).toBe('SUSPENDED');
    await t.w.suspension.quit(other.sessionId);
    expect((await t.w.starter.startOrResume('B-24187')).session.status).toBe('IN_PROGRESS');
  });

  it('starting a batch whose session is already in progress still just returns it', async () => {
    const t = await started();
    const again = await t.w.starter.startOrResume('B-24187');
    expect(again).toMatchObject({ resumed: true });
    expect(again.session.sessionId).toBe(t.sid);
  });
});
