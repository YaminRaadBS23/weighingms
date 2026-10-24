/**
 * Component preparation over HTTP against the real Dummy Scale and Dummy OrgaTEX
 * (stories 004–007; the workbook's Yellow RGB → 3 kg and Sodium Sulphate → 32 kg scenarios).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  AuditListResponse,
  ScaleOptionsResponse,
  SessionView,
} from '../../../shared/weighing';
import type { WeightResponse } from '../../../shared/scales';
import { buildApp, injectHttpClient } from '../../app';
import { buildTestApp, testConfig } from '../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/api${url}`, ...(payload ? { payload } : {}) });
const get = (url: string) => app.inject({ method: 'GET', url: `/api${url}` });
const sim = (scaleId: string, action: string, payload: object = {}) =>
  app.inject({ method: 'POST', url: `/ext/scale/_sim/${scaleId}/${action}`, payload });
const weight = async (scaleId: string) =>
  (await get(`/scales/${scaleId}/weight`)).json<WeightResponse>().weight;

async function begin() {
  app = await buildTestApp();
  await post('/operators/sign-in', { badge: 'BDG-0417' });
  const s = (await post('/sessions', { batchId: 'B-24187' })).json<SessionView>();
  const base = (seq: number) => `/sessions/${s.sessionId}/components/${seq}`;
  const view = async () => (await get(`/sessions/${s.sessionId}`)).json<SessionView>();
  const comp = (v: SessionView, seq: number) => v.components[seq - 1]!;
  const activate = async (seq: number) =>
    comp((await post(`${base(seq)}/activate`)).json<SessionView>(), seq);
  return { sid: s.sessionId, first: s, base, view, comp, activate };
}

describe('scale selection (story 005)', () => {
  it('a new session shows component 1 on scale-3kg, mode AUTO, awaiting the dyestuff', async () => {
    const { first, comp } = await begin();
    expect(comp(first, 1).scale).toEqual({ scaleId: 'scale-3kg', mode: 'AUTO', reason: null });
    expect(comp(first, 1).requirement).toEqual({ value: '1460', unit: 'g' });
    expect(comp(first, 1).preparation).toMatchObject({
      state: 'AWAITING_IDENTITY',
      identityVerified: false,
    });
    expect(comp(first, 2)).toMatchObject({ scale: null, requirement: null, preparation: null });
  });

  it.each([
    [1, 'scale-3kg', 'g'],
    [2, 'scale-3kg', 'g'],
    [3, 'scale-3kg', 'g'],
    [4, 'scale-32kg', 'kg'],
    [5, 'scale-32kg', 'kg'],
  ])('component %i → %s, requirement in %s', async (seq, scaleId, unit) => {
    const { activate } = await begin();
    const c = await activate(seq);
    expect(c.scale).toEqual({ scaleId, mode: 'AUTO', reason: null });
    expect(c.requirement!.unit).toBe(unit);
  });

  it('switching Yellow RGB → Sodium Sulphate switches the scale and the units (workbook Step 21)', async () => {
    const { base, activate } = await begin();
    expect((await activate(3)).scale!.scaleId).toBe('scale-3kg');
    await post(`${base(3)}/identity`, { code: 'DYE-4471' });
    expect(await weight('scale-3kg')).toEqual({ value: '0.0', unit: 'g' });
    expect((await activate(4)).scale!.scaleId).toBe('scale-32kg');
    await post(`${base(4)}/identity`, { code: 'AUX-0101' });
    expect(await weight('scale-32kg')).toEqual({ value: '0.000', unit: 'kg' });
  });
});

describe('identity, lot, container and automatic tare (story 004)', () => {
  it('Yellow + DYE-4471 → lot 2026-0387, container C-12, tared: net 0.0 g, UNLOCKED', async () => {
    const { base, activate, comp } = await begin();
    await activate(3);
    const res = await post(`${base(3)}/identity`, { code: 'DYE-4471' });
    expect(res.statusCode).toBe(200);
    expect(comp(res.json<SessionView>(), 3).preparation).toEqual({
      state: 'UNLOCKED',
      identityVerified: true,
      lot: { lotId: '2026-0387', source: 'DEFAULT' },
      container: { containerId: 'C-12', tare: { value: '214.0', unit: 'g' }, source: 'DEFAULT' },
      tareApplied: { value: '214.0', unit: 'g' },
    });
    expect(await weight('scale-3kg')).toEqual({ value: '0.0', unit: 'g' });
  });

  it('Sodium Sulphate → drum D-03, tare 1.850 kg on the 32 kg scale', async () => {
    const { base, activate, comp } = await begin();
    await activate(4);
    const c = comp(
      (await post(`${base(4)}/identity`, { code: 'AUX-0101' })).json<SessionView>(),
      4,
    );
    expect(c.preparation).toMatchObject({
      state: 'UNLOCKED',
      lot: { lotId: '2026-0112' },
      container: { containerId: 'D-03' },
      tareApplied: { value: '1.850', unit: 'kg' },
    });
  });

  it('typed lower-case code with spaces works like a scan', async () => {
    const { base, activate } = await begin();
    await activate(3);
    expect((await post(`${base(3)}/identity`, { code: '  dye-4471 ' })).statusCode).toBe(200);
  });

  it('DYE-2204 for Yellow → 422 WRONG_DYESTUFF; nothing unlocks, nothing is tared', async () => {
    const { base, activate, view, comp } = await begin();
    await activate(3);
    const res = await post(`${base(3)}/identity`, { code: 'DYE-2204' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: 'WRONG_DYESTUFF',
      details: { expected: 'DYE-4471', scanned: 'DYE-2204' },
    });
    expect(comp(await view(), 3).preparation).toMatchObject({
      state: 'AWAITING_IDENTITY',
      tareApplied: null,
    });
  });

  it('the previous component’s container does not leak into the next tare (found in the bolt 009 check)', async () => {
    const { base, activate, comp } = await begin();
    await activate(4);
    await post(`${base(4)}/identity`, { code: 'AUX-0101' }); // 1.850 kg drum left on scale-32kg
    await sim('scale-3kg', 'calibration', { expired: true });
    await activate(1); // Blue now goes to the 32 kg scale
    const c = comp(
      (await post(`${base(1)}/identity`, { code: 'DYE-1180' })).json<SessionView>(),
      1,
    );
    expect(c.scale!.scaleId).toBe('scale-32kg');
    expect(c.preparation!.tareApplied).toEqual({ value: '0.214', unit: 'kg' });
  });

  it('a scanned lot replaces the default; another dyestuff’s lot → 422; unknown lot → 404', async () => {
    const { base, activate, comp } = await begin();
    await activate(3);
    await post(`${base(3)}/identity`, { code: 'DYE-4471' });
    const ok = await post(`${base(3)}/lot`, { code: '2026-0402' });
    expect(comp(ok.json<SessionView>(), 3).preparation!.lot).toEqual({
      lotId: '2026-0402',
      source: 'SCANNED',
    });
    const mismatch = await post(`${base(3)}/lot`, { code: '2026-0341' });
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json().error.code).toBe('LOT_MISMATCH');
    expect((await post(`${base(3)}/lot`, { code: '9999-9999' })).statusCode).toBe(404);
  });

  it('a scanned container re-tares the scale; unknown → 404, out of service → 422', async () => {
    const { base, activate, comp } = await begin();
    await activate(3);
    await post(`${base(3)}/identity`, { code: 'DYE-4471' });
    const ok = await post(`${base(3)}/container`, { code: 'c-09' });
    expect(comp(ok.json<SessionView>(), 3).preparation).toMatchObject({
      state: 'UNLOCKED',
      container: { containerId: 'C-09', source: 'SCANNED' },
      tareApplied: { value: '214.0', unit: 'g' },
    });
    expect(await weight('scale-3kg')).toEqual({ value: '0.0', unit: 'g' });
    expect((await post(`${base(3)}/container`, { code: 'C-99' })).statusCode).toBe(404);
    const oos = await post(`${base(3)}/container`, { code: 'C-13' });
    expect(oos.statusCode).toBe(422);
    expect(oos.json().error.code).toBe('CONTAINER_OUT_OF_SERVICE');
  });

  it('with OrgaTEX offline the defaults still unlock; only a scanned lot fails (503)', async () => {
    const { base, activate, comp } = await begin();
    await app.inject({ method: 'POST', url: '/ext/orgatex/_sim/offline' });
    await activate(3);
    const res = await post(`${base(3)}/identity`, { code: 'DYE-4471' });
    expect(comp(res.json<SessionView>(), 3).preparation!.state).toBe('UNLOCKED');
    const lot = await post(`${base(3)}/lot`, { code: '2026-0402' });
    expect(lot.statusCode).toBe(503);
    expect(lot.json().error.code).toBe('ORGATEX_UNAVAILABLE');
  });

  describe('scale unavailable at unlock (story edge case)', () => {
    it('a supervisor-chosen scale that goes offline → 200, identity verified, AWAITING_TARE with SCALE_UNAVAILABLE; reconnect + scan again unlocks', async () => {
      const { base, activate, view, comp } = await begin();
      await activate(3);
      await post(`${base(3)}/scale`, {
        scaleId: 'scale-32kg',
        supervisorBadge: 'BDG-0901',
        pin: '2580',
      });
      await sim('scale-32kg', 'disconnect');
      const res = await post(`${base(3)}/identity`, { code: 'DYE-4471' });
      expect(res.statusCode).toBe(200);
      expect(comp(res.json<SessionView>(), 3).preparation).toMatchObject({
        state: 'AWAITING_TARE',
        identityVerified: true,
        tareApplied: null,
        issue: { code: 'SCALE_UNAVAILABLE' },
      });
      // reading the session later still says weighing is locked
      expect(comp(await view(), 3).preparation).toMatchObject({
        state: 'AWAITING_TARE',
        issue: { code: 'TARE_PENDING' },
      });
      await sim('scale-32kg', 'reconnect');
      const retry = await post(`${base(3)}/identity`, { code: 'DYE-4471' });
      expect(comp(retry.json<SessionView>(), 3).preparation).toMatchObject({ state: 'UNLOCKED' });
    });

    it('an automatically chosen scale that goes offline is replaced by the next suitable one', async () => {
      const { base, activate, comp } = await begin();
      await activate(3);
      await sim('scale-3kg', 'disconnect');
      const c = comp(
        (await post(`${base(3)}/identity`, { code: 'DYE-4471' })).json<SessionView>(),
        3,
      );
      expect(c.scale).toEqual({ scaleId: 'scale-32kg', mode: 'AUTO', reason: null });
      expect(c.preparation).toMatchObject({
        state: 'UNLOCKED',
        tareApplied: { value: '0.214', unit: 'kg' },
      });
    });

    it('no usable scale → AWAITING_TARE with NO_SUITABLE_SCALE', async () => {
      const { base, activate, comp } = await begin();
      await sim('scale-3kg', 'calibration', { expired: true });
      await sim('scale-32kg', 'disconnect');
      const c = await activate(3);
      expect(c.scale).toEqual({ scaleId: null, mode: 'AUTO', reason: 'NO_SUITABLE_SCALE' });
      const res = await post(`${base(3)}/identity`, { code: 'DYE-4471' });
      expect(comp(res.json<SessionView>(), 3).preparation).toMatchObject({
        state: 'AWAITING_TARE',
        issue: { code: 'NO_SUITABLE_SCALE' },
      });
    });
  });
});

describe('calibration enforcement (story 007)', () => {
  it('scale-3kg expired → Yellow RGB is assigned to scale-32kg instead', async () => {
    const { activate } = await begin();
    await sim('scale-3kg', 'calibration', { expired: true });
    expect((await activate(3)).scale).toEqual({
      scaleId: 'scale-32kg',
      mode: 'AUTO',
      reason: null,
    });
  });

  it('valid calibration has no effect', async () => {
    const { activate } = await begin();
    expect((await activate(3)).scale!.scaleId).toBe('scale-3kg');
  });

  it('a scale that expires after activation is replaced when the dyestuff is scanned', async () => {
    const { base, activate, comp } = await begin();
    await activate(3);
    await sim('scale-3kg', 'calibration', { expired: true });
    const c = comp(
      (await post(`${base(3)}/identity`, { code: 'DYE-4471' })).json<SessionView>(),
      3,
    );
    expect(c.scale!.scaleId).toBe('scale-32kg');
    expect(c.preparation!.state).toBe('UNLOCKED');
  });

  it('the strip state matches: /api/scales reports CAL_EXPIRED for the expired scale', async () => {
    await begin();
    await sim('scale-3kg', 'calibration', { expired: true });
    const list = (await get('/scales')).json<{ items: { scaleId: string; state: string }[] }>();
    expect(list.items.find((s) => s.scaleId === 'scale-3kg')!.state).toBe('CAL_EXPIRED');
  });
});

describe('supervisor scale reselection (story 006)', () => {
  const asSupervisor = { supervisorBadge: 'BDG-0901', pin: '2580' };

  it('BDG-0901 + PIN → 200, mode MANUAL, one SCALE_RESELECT audit event naming the supervisor', async () => {
    const { sid, base, activate, comp } = await begin();
    await activate(3);
    const res = await post(`${base(3)}/scale`, { scaleId: 'scale-32kg', ...asSupervisor });
    expect(res.statusCode).toBe(200);
    expect(comp(res.json<SessionView>(), 3).scale).toEqual({
      scaleId: 'scale-32kg',
      mode: 'MANUAL',
      reason: null,
    });
    const audit = (await get(`/sessions/${sid}/audit`)).json<AuditListResponse>();
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]).toMatchObject({
      type: 'SCALE_RESELECT',
      actor: { operatorId: 'OP-0901', name: 'Shift Supervisor A' },
      detail: { sequence: 3, fromScaleId: 'scale-3kg', toScaleId: 'scale-32kg' },
    });
    expect(JSON.stringify(audit)).not.toContain('2580');
  });

  it.each([
    ['operator badge', { supervisorBadge: 'BDG-0417', pin: '2580' }],
    ['wrong PIN', { supervisorBadge: 'BDG-0901', pin: '0000' }],
    ['unknown badge', { supervisorBadge: 'BDG-7777', pin: '2580' }],
  ])('%s → 403 NOT_AUTHORISED with the same body, nothing changes', async (_n, creds) => {
    const { sid, base, activate, view, comp } = await begin();
    await activate(3);
    const res = await post(`${base(3)}/scale`, { scaleId: 'scale-32kg', ...creds });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: { code: 'NOT_AUTHORISED', message: 'Supervisor authorisation failed' },
    });
    expect(comp(await view(), 3).scale!.mode).toBe('AUTO');
    expect((await get(`/sessions/${sid}/audit`)).json<AuditListResponse>().items).toEqual([]);
  });

  it('3 kg scale for Sodium Sulphate → 422 SCALE_CAPACITY_INSUFFICIENT; unknown scale → 404', async () => {
    const { base, activate } = await begin();
    await activate(4);
    const small = await post(`${base(4)}/scale`, { scaleId: 'scale-3kg', ...asSupervisor });
    expect(small.statusCode).toBe(422);
    expect(small.json().error.code).toBe('SCALE_CAPACITY_INSUFFICIENT');
    expect(
      (await post(`${base(4)}/scale`, { scaleId: 'scale-9kg', ...asSupervisor })).statusCode,
    ).toBe(404);
  });

  it('an expired scale cannot be chosen → 422 SCALE_CALIBRATION_EXPIRED; an offline scale → 503', async () => {
    const { base, activate } = await begin();
    await activate(3);
    await sim('scale-32kg', 'calibration', { expired: true });
    const expired = await post(`${base(3)}/scale`, { scaleId: 'scale-32kg', ...asSupervisor });
    expect(expired.statusCode).toBe(422);
    expect(expired.json().error.code).toBe('SCALE_CALIBRATION_EXPIRED');
    await sim('scale-32kg', 'calibration', { expired: false });
    await sim('scale-32kg', 'disconnect');
    expect(
      (await post(`${base(3)}/scale`, { scaleId: 'scale-32kg', ...asSupervisor })).statusCode,
    ).toBe(503);
  });

  it('scale-options offers every scale with its fit, so only capable scales can be picked', async () => {
    const { base, activate } = await begin();
    await activate(4);
    const options = (await get(`${base(4)}/scale-options`)).json<ScaleOptionsResponse>();
    expect(options.requirement).toEqual({ value: '25.97', unit: 'kg' });
    expect(options.items.map((i) => [i.scaleId, i.fits, i.selected])).toEqual([
      ['scale-3kg', false, false],
      ['scale-32kg', true, true],
    ]);
  });

  it('on an unlocked component the new scale is tared: net 0 on the new scale', async () => {
    const { base, activate, comp } = await begin();
    await activate(3);
    await post(`${base(3)}/identity`, { code: 'DYE-4471' });
    const res = await post(`${base(3)}/scale`, { scaleId: 'scale-32kg', ...asSupervisor });
    expect(comp(res.json<SessionView>(), 3).preparation).toMatchObject({
      state: 'UNLOCKED',
      tareApplied: { value: '0.214', unit: 'kg' },
    });
    expect(await weight('scale-32kg')).toEqual({ value: '0.000', unit: 'kg' });
  });

  it('missing fields → 400', async () => {
    const { base, activate } = await begin();
    await activate(3);
    expect((await post(`${base(3)}/scale`, { scaleId: 'scale-32kg' })).statusCode).toBe(400);
    expect(
      (await post(`${base(3)}/scale`, { supervisorBadge: 'BDG-0901', pin: '2580' })).statusCode,
    ).toBe(400);
  });
});

describe('request validation and errors', () => {
  it.each(['identity', 'lot', 'container'])(
    '%s: missing or empty code → 400 VALIDATION_ERROR',
    async (path_) => {
      const { base } = await begin();
      for (const body of [{}, { code: '' }, { code: '  ' }, { code: 5 }]) {
        const res = await post(`${base(1)}/${path_}`, body);
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
    },
  );

  it.each(['0', '-1', 'abc', '1.5'])('sequence "%s" → 400', async (seq) => {
    const { sid } = await begin();
    expect(
      (await post(`/sessions/${sid}/components/${seq}/identity`, { code: 'DYE-1180' })).statusCode,
    ).toBe(400);
    expect((await get(`/sessions/${sid}/components/${seq}/scale-options`)).statusCode).toBe(400);
  });

  it('a component that is not the active one → 409 COMPONENT_NOT_ACTIVE', async () => {
    const { base } = await begin();
    const res = await post(`${base(2)}/identity`, { code: 'DYE-2204' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('COMPONENT_NOT_ACTIVE');
  });

  it('unknown session → 404; unknown component → 404; no operator → 401', async () => {
    const { base } = await begin();
    expect(
      (await post('/sessions/nope/components/1/identity', { code: 'DYE-1180' })).statusCode,
    ).toBe(404);
    expect((await post(`${base(9)}/identity`, { code: 'DYE-1180' })).statusCode).toBe(404);
    await post('/operators/sign-out');
    const res = await post(`${base(1)}/identity`, { code: 'DYE-1180' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('NOT_SIGNED_IN');
  });
});

describe('persistence (NFR-5, NFR-6)', () => {
  it('after a server restart the unlocked component keeps scale, lot, container and tare', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'weighingms-prep-'));
    const files = {
      orgatexDbFile: path.join(dir, 'orgatex.db'),
      weighingDbFile: path.join(dir, 'weighingms.db'),
    };
    const build = () =>
      buildApp({
        config: testConfig(),
        ...files,
        orgatexHttpClient: (a) => injectHttpClient(a),
        scaleHttpClient: (a) => injectHttpClient(a, '/ext/scale'),
      });
    try {
      app = await build();
      await post('/operators/sign-in', { badge: 'BDG-0417' });
      const s = (await post('/sessions', { batchId: 'B-24187' })).json<SessionView>();
      await post(`/sessions/${s.sessionId}/components/3/activate`);
      await post(`/sessions/${s.sessionId}/components/3/identity`, { code: 'DYE-4471' });
      await post(`/sessions/${s.sessionId}/components/3/lot`, { code: '2026-0402' });
      await app.close();

      app = await build();
      const after = (await get('/sessions/current')).json().session as SessionView;
      expect(after.components[2]!.scale).toEqual({
        scaleId: 'scale-3kg',
        mode: 'AUTO',
        reason: null,
      });
      expect(after.components[2]!.preparation).toMatchObject({
        state: 'UNLOCKED',
        lot: { lotId: '2026-0402', source: 'SCANNED' },
        container: { containerId: 'C-12' },
        tareApplied: { value: '214.0', unit: 'g' },
      });
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
