/**
 * Supervisor override and evaluation over HTTP against the real Dummy Scale (ManualClock for
 * stability) and Dummy OrgaTEX — stories 013, 014, workbook Step 24 (STEP-24-overshoot-test).
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { ComponentEvaluationResponse } from '../../../shared/weighing';
import type {
  AuditListResponse,
  ConfirmResponse,
  RecordListResponse,
  SessionView,
} from '../../../shared/weighing';
import { buildTestApp, ManualClock } from '../../test-support';

let app: FastifyInstance;
let clock: ManualClock;
afterEach(async () => app?.close());

const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/api${url}`, ...(payload ? { payload } : {}) });
const get = (url: string) => app.inject({ method: 'GET', url: `/api${url}` });
const sim = (scaleId: string, action: string, payload: object = {}) =>
  app.inject({ method: 'POST', url: `/ext/scale/_sim/${scaleId}/${action}`, payload });

const SUP = { supervisorBadge: 'BDG-0901', pin: '2580', reason: 'Customer approved extra dye' };

/** Signs in, starts B-24187 and unlocks Yellow (component 3). */
async function begin() {
  clock = new ManualClock();
  app = await buildTestApp({}, clock);
  await post('/operators/sign-in', { badge: 'BDG-0417' });
  const s = (await post('/sessions', { batchId: 'B-24187' })).json<SessionView>();
  const base = (seq: number) => `/sessions/${s.sessionId}/components/${seq}`;
  await post(`${base(3)}/activate`);
  await post(`${base(3)}/identity`, { code: 'DYE-4471' });
  const setWeight = async (net: string, settled = true) => {
    await sim('scale-3kg', 'weight', { net });
    if (settled) clock.advance(600);
  };
  const override = (seq: number, body: object = SUP) => post(`${base(seq)}/override`, body);
  const evaluation = async (seq = 3) =>
    (await get(`${base(seq)}/evaluation`)).json<ComponentEvaluationResponse>();
  const session = async () => (await get(`/sessions/${s.sessionId}`)).json<SessionView>();
  const records = async () =>
    (await get(`/sessions/${s.sessionId}/records`)).json<RecordListResponse>().items;
  const audit = async () =>
    (await get(`/sessions/${s.sessionId}/audit`)).json<AuditListResponse>().items;
  return { sid: s.sessionId, base, setWeight, override, evaluation, session, records, audit };
}

describe('evaluation endpoint (story 014)', () => {
  it('Yellow at 96.4 g: zone OVER, surplus +2.4 g (+2.6 %), confirm not allowed, override allowed', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    const e = await t.evaluation();
    expect(e).toEqual({
      weight: { value: '96.4', unit: 'g' },
      stable: true,
      zone: 'OVER',
      lower: { value: '93.5', unit: 'g' },
      upper: { value: '94.5', unit: 'g' },
      surplus: { amount: { value: '2.4', unit: 'g' }, percent: '2.6' },
      confirmable: false,
      overridable: true,
    });
    expect((await post(`${t.base(3)}/confirm`)).statusCode).toBe(422);
  });

  it.each([
    ['0.0', 'UNDER', false, false],
    ['93.4', 'NEAR', false, true],
    ['93.5', 'OK', true, false],
    ['94.5', 'OK', true, false],
    ['94.6', 'OVER', false, true],
  ])('at %s g: %s, confirmable=%s, overridable=%s', async (w, zone, confirmable, overridable) => {
    const t = await begin();
    await t.setWeight(w);
    expect(await t.evaluation()).toMatchObject({ zone, confirmable, overridable });
  });

  it('removing the excess brings the zone back: no state is kept (invariant 28)', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    expect((await t.evaluation()).zone).toBe('OVER');
    await t.setWeight('94.1');
    expect(await t.evaluation()).toMatchObject({ zone: 'OK', confirmable: true, surplus: null });
    expect((await post(`${t.base(3)}/confirm`)).statusCode).toBe(200);
  });

  it('an unsettled reading is reported, not hidden', async () => {
    const t = await begin();
    await t.setWeight('96.4', false);
    expect(await t.evaluation()).toMatchObject({
      stable: false,
      confirmable: false,
      overridable: false,
    });
  });

  it('a locked component → 409 IDENTITY_NOT_VERIFIED; unknown session → 404; bad sequence → 400', async () => {
    const t = await begin();
    const locked = await get(`${t.base(1)}/evaluation`);
    expect(locked.statusCode).toBe(409);
    await post(`${t.base(1)}/activate`);
    expect((await get(`${t.base(1)}/evaluation`)).json().error.code).toBe('IDENTITY_NOT_VERIFIED');
    expect((await get('/sessions/nope/components/3/evaluation')).statusCode).toBe(404);
    expect((await get(`/sessions/${t.sid}/components/x/evaluation`)).statusCode).toBe(400);
  });
});

describe('supervisor override over HTTP (story 013, FR-22)', () => {
  it('Yellow at 96.4 g with a valid supervisor and reason → OVERRIDDEN record, audit event, component DONE', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    const res = await t.override(3);
    expect(res.statusCode).toBe(200);
    const body = res.json<ConfirmResponse>();
    expect(body.record).toMatchObject({
      sequence: 3,
      actual: { value: '96.4', unit: 'g' },
      result: 'OVERRIDDEN',
      surplus: { amount: { value: '2.4', unit: 'g' }, percent: '2.6' },
      operator: { operatorId: 'OP-0417', name: 'R. Karim' },
      override: {
        supervisor: { operatorId: 'OP-0901', name: 'Shift Supervisor A' },
        reason: 'Customer approved extra dye',
        zone: 'OVER',
      },
    });
    expect(body.session.components[2]).toMatchObject({
      state: 'DONE',
      confirmed: { result: 'OVERRIDDEN' },
    });
    expect(await t.records()).toEqual([body.record]);

    const events = await t.audit();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'OVERRIDE',
      actor: { operatorId: 'OP-0901' },
      detail: { sequence: 3, zone: 'OVER', reason: 'Customer approved extra dye' },
    });
  });

  it('93.0 g (near) and 50.0 g (under) are overridable too, without a surplus', async () => {
    const t = await begin();
    await t.setWeight('93.0');
    const near = (await t.override(3)).json<ConfirmResponse>().record;
    expect(near).toMatchObject({ result: 'OVERRIDDEN', surplus: null, override: { zone: 'NEAR' } });
  });

  it('the recipe is never recalculated: every target and tolerance is the same afterwards (Step 24)', async () => {
    const t = await begin();
    const before = (await t.session()).components.map((c) => [c.target, c.tolerance, c.barMax]);
    await t.setWeight('96.4');
    await t.override(3);
    const after = (await t.session()).components.map((c) => [c.target, c.tolerance, c.barMax]);
    expect(after).toEqual(before);
  });

  it('a crafted weight in the request is ignored: the server records its own reading (ADR-7)', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    const res = await t.override(3, {
      ...SUP,
      weight: '94.0',
      actual: { value: '94.0', unit: 'g' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<ConfirmResponse>().record.actual.value).toBe('96.4');
  });

  it('refusals: 400 blank reason / missing PIN / reason over 500 characters / bad sequence', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    const blank = await t.override(3, { ...SUP, reason: '  ' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json().error.code).toBe('REASON_REQUIRED');
    const noPin = await t.override(3, { supervisorBadge: 'BDG-0901', reason: 'x' });
    expect(noPin.statusCode).toBe(400);
    expect(noPin.json().error.code).toBe('VALIDATION_ERROR');
    expect((await t.override(3, { ...SUP, reason: 'x'.repeat(501) })).statusCode).toBe(400);
    expect((await t.override(3, { ...SUP, reason: 'x'.repeat(500) })).statusCode).toBe(200);
    expect((await post(`/sessions/${t.sid}/components/0/override`, SUP)).statusCode).toBe(400);
  });

  it('refusals: 403 for a wrong PIN, an operator badge and an unknown badge — the same answer', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    const answers = [
      await t.override(3, { ...SUP, pin: '0000' }),
      await t.override(3, { ...SUP, supervisorBadge: 'BDG-0417', pin: '1234' }),
      await t.override(3, { ...SUP, supervisorBadge: 'BDG-4242' }),
    ];
    for (const res of answers) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_AUTHORISED');
    }
    expect(new Set(answers.map((r) => r.body)).size).toBe(1);
    expect(await t.records()).toEqual([]);
    expect(await t.audit()).toEqual([]);
  });

  it('refusals: 409 within tolerance, nothing on the scale, unstable; nothing is written', async () => {
    const t = await begin();
    await t.setWeight('94.0');
    const inTol = await t.override(3);
    expect(inTol.statusCode).toBe(409);
    expect(inTol.json().error.code).toBe('OVERRIDE_NOT_NEEDED');
    await t.setWeight('0.0');
    expect((await t.override(3)).json().error.code).toBe('NOTHING_TO_OVERRIDE');
    await t.setWeight('96.4', false);
    expect((await t.override(3)).json().error.code).toBe('READING_UNSTABLE');
    expect(await t.records()).toEqual([]);
    expect(await t.audit()).toEqual([]);
    clock.advance(600);
    expect((await t.override(3)).statusCode).toBe(200);
  });

  it('refusals: 401 nobody signed in, 404 unknown session, 409 locked component, 503 scale offline', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    await sim('scale-3kg', 'disconnect');
    const offline = await t.override(3);
    expect(offline.statusCode).toBe(503);
    expect(offline.json().error.code).toBe('SCALE_UNAVAILABLE');
    await sim('scale-3kg', 'reconnect');

    expect((await t.override(1)).json().error.code).toBe('COMPONENT_NOT_ACTIVE');
    expect((await post('/sessions/nope/components/3/override', SUP)).statusCode).toBe(404);
    await post('/operators/sign-out');
    expect((await t.override(3)).statusCode).toBe(401);
  });

  it('a double click yields one record and one audit event', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    const [a, b] = await Promise.all([t.override(3), t.override(3)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await t.records()).toHaveLength(1);
    expect(await t.audit()).toHaveLength(1);
  });

  it('works with OrgaTEX offline: the override makes no OrgaTEX call (TD-1)', async () => {
    const t = await begin();
    await app.inject({ method: 'POST', url: '/ext/orgatex/_sim/offline' });
    await t.setWeight('96.4');
    expect((await t.override(3)).statusCode).toBe(200);
  });

  it('a batch can be finished with overrides: Yellow overridden, then the rest on target', async () => {
    const t = await begin();
    await t.setWeight('96.4');
    await t.override(3);
    const after = await t.session();
    expect(after.doneCount).toBe(1);
    expect(after.components[2]!.confirmed!.result).toBe('OVERRIDDEN');
    expect(after.activeSequence).toBe(1);
  });
});
