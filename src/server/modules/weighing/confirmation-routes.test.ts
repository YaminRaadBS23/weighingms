/**
 * Confirmation, progression, completion, re-tare, quit and resume over HTTP against the real Dummy
 * Scale (ManualClock for stability) and Dummy OrgaTEX — stories 008–012, workbook Steps 22, 23, 25.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  AuditListResponse,
  ConfirmResponse,
  RecordListResponse,
  SessionView,
} from '../../../shared/weighing';
import type { WeightResponse } from '../../../shared/scales';
import { buildApp, injectHttpClient } from '../../app';
import { buildTestApp, ManualClock, testConfig } from '../../test-support';

let app: FastifyInstance;
let clock: ManualClock;
afterEach(async () => app?.close());

const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/api${url}`, ...(payload ? { payload } : {}) });
const get = (url: string) => app.inject({ method: 'GET', url: `/api${url}` });
const sim = (scaleId: string, action: string, payload: object = {}) =>
  app.inject({ method: 'POST', url: `/ext/scale/_sim/${scaleId}/${action}`, payload });

const CODES = ['DYE-1180', 'DYE-2204', 'DYE-4471', 'AUX-0101', 'AUX-0107'];
const ON_TARGET = ['1240.0', '386.0', '94.0', '24.000', '9.600'];
const SCALE_OF = ['scale-3kg', 'scale-3kg', 'scale-3kg', 'scale-32kg', 'scale-32kg'];

async function begin() {
  clock = new ManualClock();
  app = await buildTestApp({}, clock);
  await post('/operators/sign-in', { badge: 'BDG-0417' });
  const s = (await post('/sessions', { batchId: 'B-24187' })).json<SessionView>();
  const base = (seq: number) => `/sessions/${s.sessionId}/components/${seq}`;
  const session = async () => (await get(`/sessions/${s.sessionId}`)).json<SessionView>();
  /** Puts a weight on the scale and lets it settle (or not). */
  const setWeight = async (scaleId: string, net: string, settled = true) => {
    await sim(scaleId, 'weight', { net });
    if (settled) clock.advance(600);
  };
  const unlock = (seq: number) => post(`${base(seq)}/identity`, { code: CODES[seq - 1] });
  const confirm = (seq: number, body?: object) => post(`${base(seq)}/confirm`, body);
  /** Unlocks the active component, puts its target on the scale and confirms. */
  const weighTarget = async (seq: number) => {
    await unlock(seq);
    await setWeight(SCALE_OF[seq - 1]!, ON_TARGET[seq - 1]!);
    return confirm(seq);
  };
  const records = async () =>
    (await get(`/sessions/${s.sessionId}/records`)).json<RecordListResponse>().items;
  const weight = async (scaleId: string) =>
    (await get(`/scales/${scaleId}/weight`)).json<WeightResponse>().weight;
  return {
    sid: s.sessionId,
    first: s,
    base,
    session,
    setWeight,
    unlock,
    confirm,
    weighTarget,
    records,
    weight,
  };
}

describe('tolerance gating on the server (story 008/009, workbook Step 22)', () => {
  it.each([
    ['0.0', 422, 'UNDER'],
    ['93.4', 422, 'NEAR'],
    ['93.5', 200, 'OK'],
    ['94.0', 200, 'OK'],
    ['94.5', 200, 'OK'],
    ['94.6', 422, 'OVER'],
  ])('Yellow RGB at %s g → HTTP %i (%s)', async (w, status, zone) => {
    const t = await begin();
    await post(`${t.base(3)}/activate`);
    await t.unlock(3);
    await t.setWeight('scale-3kg', w);
    const res = await t.confirm(3);
    expect(res.statusCode).toBe(status);
    if (status === 422) {
      expect(res.json().error).toMatchObject({
        code: 'TOLERANCE_VIOLATION',
        details: { zone, lower: { value: '93.5', unit: 'g' }, upper: { value: '94.5', unit: 'g' } },
      });
      expect(await t.records()).toEqual([]);
    } else {
      expect(res.json<ConfirmResponse>().record.actual.value).toBe(w);
    }
  });

  it.each([
    ['23.879', 422],
    ['23.880', 200],
    ['24.000', 200],
    ['24.120', 200],
    ['24.121', 422],
  ])('Sodium Sulphate at %s kg → HTTP %i', async (w, status) => {
    const t = await begin();
    await post(`${t.base(4)}/activate`);
    await t.unlock(4);
    await t.setWeight('scale-32kg', w);
    expect((await t.confirm(4)).statusCode).toBe(status);
  });

  it('a crafted request cannot change the outcome: the server uses its own reading (ADR-7)', async () => {
    const t = await begin();
    await post(`${t.base(3)}/activate`);
    await t.unlock(3);
    await t.setWeight('scale-3kg', '94.6');
    for (const body of [
      { weight: '94.2' },
      { actual: { value: '94.2', unit: 'g' } },
      { net: '94.2', stable: true },
    ]) {
      const res = await t.confirm(3, body);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('TOLERANCE_VIOLATION');
    }
    expect(await t.records()).toEqual([]);
  });

  it('the same crafted body cannot make an in-tolerance weight different either: the record holds the measured value', async () => {
    const t = await begin();
    await post(`${t.base(3)}/activate`);
    await t.unlock(3);
    await t.setWeight('scale-3kg', '94.2');
    const res = await t.confirm(3, { weight: '94.4' });
    expect(res.json<ConfirmResponse>().record.actual).toEqual({ value: '94.2', unit: 'g' });
  });
});

describe('confirm (story 009, workbook Step 25)', () => {
  it('Yellow RGB at a stable 94.2 g → the record has every field and the component is DONE', async () => {
    const t = await begin();
    await post(`${t.base(3)}/activate`);
    await t.unlock(3);
    await t.setWeight('scale-3kg', '94.2');
    const res = await t.confirm(3);
    expect(res.statusCode).toBe(200);
    const { record, session } = res.json<ConfirmResponse>();
    expect(record).toMatchObject({
      sessionId: t.sid,
      batchId: 'B-24187',
      sequence: 3,
      dyestuff: { code: 'DYE-4471', name: 'Remazol Yellow RGB' },
      actual: { value: '94.2', unit: 'g' },
      target: { value: '94.0', unit: 'g' },
      toleranceLower: { value: '93.5', unit: 'g' },
      toleranceUpper: { value: '94.5', unit: 'g' },
      lotId: '2026-0387',
      containerId: 'C-12',
      tare: { value: '214.0', unit: 'g' },
      scaleId: 'scale-3kg',
      operator: { operatorId: 'OP-0417', name: 'R. Karim' },
      result: 'IN_TOLERANCE',
      surplus: null,
    });
    expect(Date.parse(record.confirmedAt)).not.toBeNaN();
    expect(session.components[2]).toMatchObject({
      state: 'DONE',
      scale: null,
      preparation: null,
      confirmed: {
        recordId: record.recordId,
        actual: { value: '94.2', unit: 'g' },
        result: 'IN_TOLERANCE',
      },
    });
  });

  it('GET …/records returns the records in component order (evidence STEP-25-transaction.json)', async () => {
    const t = await begin();
    await t.weighTarget(1);
    await t.weighTarget(2);
    const items = await t.records();
    expect(items.map((r) => [r.sequence, r.dyestuff.code, r.actual.value])).toEqual([
      [1, 'DYE-1180', '1240.0'],
      [2, 'DYE-2204', '386.0'],
    ]);
    expect((await get('/sessions/nope/records')).statusCode).toBe(404);
  });

  it('an unstable reading → 409 READING_UNSTABLE; once settled it is accepted', async () => {
    const t = await begin();
    await t.unlock(1);
    await t.setWeight('scale-3kg', '1240.0', false);
    const early = await t.confirm(1);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('READING_UNSTABLE');
    clock.advance(600);
    expect((await t.confirm(1)).statusCode).toBe(200);
  });

  it('scale disconnected → 503 SCALE_UNAVAILABLE; calibration expired → 422 SCALE_CALIBRATION_EXPIRED', async () => {
    const t = await begin();
    await t.unlock(1);
    await t.setWeight('scale-3kg', '1240.0');
    await sim('scale-3kg', 'disconnect');
    const offline = await t.confirm(1);
    expect(offline.statusCode).toBe(503);
    expect(offline.json().error.code).toBe('SCALE_UNAVAILABLE');
    await sim('scale-3kg', 'reconnect');
    await sim('scale-3kg', 'calibration', { expired: true });
    const expired = await t.confirm(1);
    expect(expired.statusCode).toBe(422);
    expect(expired.json().error.code).toBe('SCALE_CALIBRATION_EXPIRED');
    expect(await t.records()).toEqual([]);
  });

  it('a locked component → 409 IDENTITY_NOT_VERIFIED (carried from bolt 009)', async () => {
    const t = await begin();
    const res = await t.confirm(1);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('IDENTITY_NOT_VERIFIED');
  });

  it('a double click: the second request → 409 COMPONENT_ALREADY_DONE, one record', async () => {
    const t = await begin();
    await t.unlock(1);
    await t.setWeight('scale-3kg', '1240.0');
    const [a, b] = await Promise.all([t.confirm(1), t.confirm(1)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect([a, b].find((r) => r.statusCode === 409)!.json().error.code).toBe(
      'COMPONENT_ALREADY_DONE',
    );
    expect(await t.records()).toHaveLength(1);
  });

  it('records cannot be changed or deleted: no such endpoint exists', async () => {
    const t = await begin();
    await t.weighTarget(1);
    const [record] = await t.records();
    for (const [method, url] of [
      ['PUT', `/api/sessions/${t.sid}/records`],
      ['PATCH', `/api/sessions/${t.sid}/records`],
      ['DELETE', `/api/sessions/${t.sid}/records`],
      ['PUT', `/api/sessions/${t.sid}/records/${record!.recordId}`],
      ['PATCH', `/api/sessions/${t.sid}/records/${record!.recordId}`],
      ['DELETE', `/api/sessions/${t.sid}/records/${record!.recordId}`],
      ['DELETE', `/api/sessions/${t.sid}/components/1/confirm`],
    ] as const) {
      expect([404, 405]).toContain((await app.inject({ method, url })).statusCode);
    }
    expect(await t.records()).toHaveLength(1);
  });

  it('validation: bad sequence → 400; unknown session → 404; unknown component → 404; no operator → 401', async () => {
    const t = await begin();
    expect((await post(`/sessions/${t.sid}/components/0/confirm`)).statusCode).toBe(400);
    expect((await post(`/sessions/${t.sid}/components/abc/retare`)).statusCode).toBe(400);
    expect((await post('/sessions/nope/components/1/confirm')).statusCode).toBe(404);
    expect((await post(`/sessions/${t.sid}/components/9/confirm`)).statusCode).toBe(404);
    await post('/operators/sign-out');
    const res = await t.confirm(1);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('NOT_SIGNED_IN');
  });
});

describe('progression and completion (workbook Step 23, story 010)', () => {
  it('Blue → Red → Yellow → Sodium Sulphate → Soda Ash: each becomes ACTIVE on its scale, a component only completes with a valid weight', async () => {
    const t = await begin();
    const seen: string[] = [];
    for (let seq = 1; seq <= 5; seq++) {
      const before = await t.session();
      expect(before.activeSequence).toBe(seq);
      expect(before.components[seq - 1]!.scale!.scaleId).toBe(SCALE_OF[seq - 1]);
      // an invalid weight first: it must not complete the component
      await t.unlock(seq);
      await t.setWeight(SCALE_OF[seq - 1]!, '0.0');
      expect((await t.confirm(seq)).statusCode).toBe(422);
      expect((await t.session()).components[seq - 1]!.state).toBe('ACTIVE');
      await t.setWeight(SCALE_OF[seq - 1]!, ON_TARGET[seq - 1]!);
      const res = await t.confirm(seq);
      expect(res.statusCode).toBe(200);
      seen.push(res.json<ConfirmResponse>().record.dyestuff.code);
    }
    expect(seen).toEqual(CODES);
    const done = await t.session();
    expect(done.components.map((c) => c.state)).toEqual(['DONE', 'DONE', 'DONE', 'DONE', 'DONE']);
    expect(done.doneCount).toBe(5);
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).not.toBeNull();
    expect(done.activeSequence).toBeNull();
  });

  it('complete at 4 of 5 → 422 BATCH_INCOMPLETE; the last confirmation completes automatically; complete again is 200', async () => {
    const t = await begin();
    for (let seq = 1; seq <= 4; seq++) await t.weighTarget(seq);
    const early = await post(`/sessions/${t.sid}/complete`);
    expect(early.statusCode).toBe(422);
    expect(early.json().error).toMatchObject({
      code: 'BATCH_INCOMPLETE',
      details: { done: 4, total: 5 },
    });
    await t.weighTarget(5);
    expect((await get('/sessions/current')).json()).toEqual({ session: null });
    const again = await post(`/sessions/${t.sid}/complete`);
    expect(again.statusCode).toBe(200);
    expect(again.json<SessionView>().status).toBe('COMPLETED');
  });

  it('after completion every component action → 409 SESSION_COMPLETED, and starting the batch makes a new session only if it is released again', async () => {
    const t = await begin();
    for (let seq = 1; seq <= 5; seq++) await t.weighTarget(seq);
    for (const url of [
      `${t.base(5)}/confirm`,
      `${t.base(5)}/identity`,
      `${t.base(5)}/retare`,
      `${t.base(1)}/activate`,
      `/sessions/${t.sid}/quit`,
    ]) {
      const res = await post(url, url.endsWith('identity') ? { code: 'AUX-0107' } : undefined);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('SESSION_COMPLETED');
    }
    expect(await t.records()).toHaveLength(5);
  });

  it('the whole batch can be weighed and completed with OrgaTEX offline (TD-1, ADR-8)', async () => {
    const t = await begin();
    await app.inject({ method: 'POST', url: '/ext/orgatex/_sim/offline' });
    for (let seq = 1; seq <= 5; seq++) {
      expect((await t.weighTarget(seq)).statusCode).toBe(200);
    }
    const done = await t.session();
    expect(done.status).toBe('COMPLETED');
  });

  it('each record carries the scale, unit and tare of its own component (g scale for dyes, kg scale for auxiliaries)', async () => {
    const t = await begin();
    for (let seq = 1; seq <= 5; seq++) await t.weighTarget(seq);
    expect(
      (await t.records()).map((r) => [r.scaleId, r.actual.unit, r.tare.value, r.containerId]),
    ).toEqual([
      ['scale-3kg', 'g', '214.0', 'C-09'],
      ['scale-3kg', 'g', '214.0', 'C-11'],
      ['scale-3kg', 'g', '214.0', 'C-12'],
      ['scale-32kg', 'kg', '1.850', 'D-03'],
      ['scale-32kg', 'kg', '1.850', 'D-05'],
    ]);
  });
});

describe('re-tare (story 011, FR-23)', () => {
  it('Yellow at 50.0 g: re-tare → net 0.0 g; still to weigh is the full target again; no record', async () => {
    const t = await begin();
    await post(`${t.base(3)}/activate`);
    await t.unlock(3);
    await t.setWeight('scale-3kg', '50.0');
    expect((await t.weight('scale-3kg')).value).toBe('50.0');
    const res = await post(`${t.base(3)}/retare`);
    expect(res.statusCode).toBe(200);
    expect(res.json<SessionView>().components[2]!.preparation).toMatchObject({
      state: 'UNLOCKED',
      tareApplied: { value: '264.0', unit: 'g' },
    });
    expect(await t.weight('scale-3kg')).toMatchObject({ value: '0.0', unit: 'g' });
    expect(await t.records()).toEqual([]);
  });

  it('an over-tolerance weight is gone after a re-tare; the new tare is the one recorded', async () => {
    const t = await begin();
    await post(`${t.base(3)}/activate`);
    await t.unlock(3);
    await t.setWeight('scale-3kg', '96.4');
    expect((await t.confirm(3)).statusCode).toBe(422);
    await post(`${t.base(3)}/retare`);
    await t.setWeight('scale-3kg', '94.0');
    const res = await t.confirm(3);
    expect(res.statusCode).toBe(200);
    expect(res.json<ConfirmResponse>().record.tare).toEqual({ value: '310.4', unit: 'g' });
  });

  it('a DONE component → 409 COMPONENT_ALREADY_DONE; locked → 409 IDENTITY_NOT_VERIFIED; scale offline → 503 with the state unchanged', async () => {
    const t = await begin();
    await t.weighTarget(1);
    const done = await post(`${t.base(1)}/retare`);
    expect(done.statusCode).toBe(409);
    expect(done.json().error.code).toBe('COMPONENT_ALREADY_DONE');
    const locked = await post(`${t.base(2)}/retare`);
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error.code).toBe('IDENTITY_NOT_VERIFIED');
    expect((await post(`${t.base(4)}/retare`)).json().error.code).toBe('COMPONENT_NOT_ACTIVE');
    await t.unlock(2);
    const before = (await t.session()).components[1]!.preparation;
    await sim('scale-3kg', 'disconnect');
    const offline = await post(`${t.base(2)}/retare`);
    expect(offline.statusCode).toBe(503);
    expect((await t.session()).components[1]!.preparation).toEqual(before);
  });
});

describe('quit and resume (story 012, FR-24)', () => {
  it('Quit with Blue and Red done and Yellow at 50.0 g: SUSPENDED, ABANDON audit, nothing active, records kept; the batch stays WEIGHING', async () => {
    const t = await begin();
    await t.weighTarget(1);
    await t.weighTarget(2);
    await t.unlock(3);
    await t.setWeight('scale-3kg', '50.0');
    const res = await post(`/sessions/${t.sid}/quit`);
    expect(res.statusCode).toBe(200);
    const view = res.json<SessionView>();
    expect(view.status).toBe('SUSPENDED');
    expect(view.activeSequence).toBeNull();
    expect(view.components.map((c) => c.state)).toEqual([
      'DONE',
      'DONE',
      'PENDING',
      'PENDING',
      'PENDING',
    ]);
    const audit = (await get(`/sessions/${t.sid}/audit`)).json<AuditListResponse>();
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]).toMatchObject({
      type: 'ABANDON',
      actor: { name: 'R. Karim' },
      detail: {
        sequence: 3,
        dyestuffCode: 'DYE-4471',
        weight: { value: '50.0', unit: 'g' },
        doneCount: 2,
      },
    });
    expect(await t.records()).toHaveLength(2);
    expect((await get('/sessions/current')).json()).toEqual({ session: null });
    expect((await get('/batches/B-24187')).json().status).toBe('WEIGHING');
  });

  it('selecting the batch again resumes: Blue and Red DONE with their records, Yellow ACTIVE and locked', async () => {
    const t = await begin();
    await t.weighTarget(1);
    await t.weighTarget(2);
    await t.unlock(3);
    await post(`/sessions/${t.sid}/quit`);
    const res = await post('/sessions', { batchId: 'B-24187' });
    expect(res.statusCode).toBe(200);
    const view = res.json<SessionView>();
    expect(view.sessionId).toBe(t.sid);
    expect(view.status).toBe('IN_PROGRESS');
    expect(view.components.map((c) => c.state)).toEqual([
      'DONE',
      'DONE',
      'ACTIVE',
      'PENDING',
      'PENDING',
    ]);
    expect(view.components[2]).toMatchObject({
      scale: { scaleId: 'scale-3kg', mode: 'AUTO' },
      preparation: { state: 'AWAITING_IDENTITY' },
    });
    expect(view.components[0]!.confirmed!.actual.value).toBe('1240.0');
    expect((await get('/sessions/current')).json().session.sessionId).toBe(t.sid); // a reload finds it
  });

  it('quit with nothing weighed is allowed; the audit event records no weight', async () => {
    const t = await begin();
    expect((await post(`/sessions/${t.sid}/quit`)).statusCode).toBe(200);
    const audit = (await get(`/sessions/${t.sid}/audit`)).json<AuditListResponse>();
    expect(audit.items[0]!.detail).toMatchObject({ sequence: 1, weight: null, doneCount: 0 });
  });

  it('quit twice → 409; actions while suspended → 409 SESSION_NOT_IN_PROGRESS; unknown session → 404', async () => {
    const t = await begin();
    await post(`/sessions/${t.sid}/quit`);
    const again = await post(`/sessions/${t.sid}/quit`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('SESSION_NOT_IN_PROGRESS');
    expect((await t.unlock(1)).json().error.code).toBe('SESSION_NOT_IN_PROGRESS');
    expect((await post('/sessions/nope/quit')).statusCode).toBe(404);
  });

  it('a different batch can be started after a quit; resuming the first one then waits (ADR-3)', async () => {
    const t = await begin();
    await post(`/sessions/${t.sid}/quit`);
    const other = await post('/sessions', { batchId: 'B-24188' });
    expect(other.statusCode).toBe(201);
    const blocked = await post('/sessions', { batchId: 'B-24187' });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('SESSION_IN_PROGRESS');
  });
});

describe('durability (NFR-5, NFR-6)', () => {
  it('after a server restart the confirmed records and states are still there, and weighing continues', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'weighingms-confirm-'));
    const files = {
      orgatexDbFile: path.join(dir, 'orgatex.db'),
      weighingDbFile: path.join(dir, 'weighingms.db'),
    };
    const build = () => {
      clock = new ManualClock();
      return buildApp({
        config: testConfig(),
        ...files,
        orgatexHttpClient: (a) => injectHttpClient(a),
        scaleHttpClient: (a) => injectHttpClient(a, '/ext/scale'),
        deviceClock: clock,
      });
    };
    try {
      app = await build();
      await post('/operators/sign-in', { badge: 'BDG-0417' });
      const s = (await post('/sessions', { batchId: 'B-24187' })).json<SessionView>();
      const confirmFirst = async (seq: number) => {
        await post(`/sessions/${s.sessionId}/components/${seq}/identity`, { code: CODES[seq - 1] });
        await sim('scale-3kg', 'weight', { net: ON_TARGET[seq - 1] });
        clock.advance(600);
        return post(`/sessions/${s.sessionId}/components/${seq}/confirm`);
      };
      expect((await confirmFirst(1)).statusCode).toBe(200);
      expect((await confirmFirst(2)).statusCode).toBe(200);
      const before = (await get(`/sessions/${s.sessionId}/records`)).json<RecordListResponse>()
        .items;
      await app.close();

      app = await build();
      await post('/operators/sign-in', { badge: 'BDG-0417' });
      const after = (await get(`/sessions/${s.sessionId}/records`)).json<RecordListResponse>()
        .items;
      expect(after).toEqual(before);
      const current = (await get('/sessions/current')).json().session as SessionView;
      expect(current.components.map((c) => c.state)).toEqual([
        'DONE',
        'DONE',
        'ACTIVE',
        'PENDING',
        'PENDING',
      ]);
      expect(current.components[0]!.confirmed!.recordId).toBe(before[0]!.recordId);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a request body that is not valid JSON answers 400, not 500', async () => {
    const t = await begin();
    const res = await app.inject({
      method: 'POST',
      url: `/api${t.base(1)}/identity`,
      headers: { 'content-type': 'application/json' },
      payload: 'not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
