import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SessionView } from '../../../shared/weighing';
import { buildApp, injectHttpClient } from '../../app';
import { buildTestApp, testConfig } from '../../test-support';
import { WeighingSession } from './domain/weighing-session';

let app: FastifyInstance;
afterEach(async () => app?.close());

const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/api${url}`, ...(payload ? { payload } : {}) });
const get = (url: string) => app.inject({ method: 'GET', url: `/api${url}` });
const signIn = (badge = 'BDG-0417') => post('/operators/sign-in', { badge });
const start = (batchId = 'B-24187') => post('/sessions', { batchId });
const states = (s: SessionView) => s.components.map((c) => c.state);

describe('Story 001 — operator sign-in', () => {
  it('signs in R. Karim by badge; he becomes the station operator', async () => {
    app = await buildTestApp();
    const res = await signIn();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      operatorId: 'OP-0417',
      badgeId: 'BDG-0417',
      name: 'R. Karim',
      shift: 'Shift A',
      role: 'OPERATOR',
    });
    expect((await get('/operators/current')).json().operator).toMatchObject({
      name: 'R. Karim',
      shift: 'Shift A',
    });
  });

  it.each(['BDG-0999', 'BDG-1111'])(
    'unknown or inactive badge %s → 401 OPERATOR_UNKNOWN',
    async (badge) => {
      app = await buildTestApp();
      const res = await signIn(badge);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('OPERATOR_UNKNOWN');
    },
  );

  it('no operator → 401 NOT_SIGNED_IN on session start', async () => {
    app = await buildTestApp();
    const res = await start();
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('NOT_SIGNED_IN');
  });

  it('current is null before sign-in and after sign-out; empty badge → 400', async () => {
    app = await buildTestApp();
    expect((await get('/operators/current')).json()).toEqual({ operator: null });
    await signIn();
    expect((await post('/operators/sign-out')).json()).toEqual({ operator: null });
    expect((await get('/operators/current')).json()).toEqual({ operator: null });
    expect((await post('/operators/sign-in', { badge: ' ' })).statusCode).toBe(400);
  });
});

describe('Story 002 — start or resume a weighing session', () => {
  it('B-24187: 201, IN_PROGRESS, recipe snapshot, component 1 ACTIVE, OrgaTEX status WEIGHING', async () => {
    app = await buildTestApp();
    await signIn();
    const res = await start();
    expect(res.statusCode).toBe(201);
    const s = res.json<SessionView>();
    expect(s).toMatchObject({
      batchId: 'B-24187',
      status: 'IN_PROGRESS',
      startedBy: { operatorId: 'OP-0417', name: 'R. Karim' },
      recipe: { recipeId: 'RCP-TEAL-4C', shade: 'Teal 4C' },
      componentCount: 5,
      doneCount: 0,
      activeSequence: 1,
      orgatexStatusSync: 'SYNCED',
    });
    expect(states(s)).toEqual(['ACTIVE', 'PENDING', 'PENDING', 'PENDING', 'PENDING']);
    expect(
      s.components.map((c) => `${c.dyestuff.shortName} ${c.target.value} ${c.target.unit}`),
    ).toEqual([
      'Blue RSPL 1240.0 g',
      'Red RB 386.0 g',
      'Yellow RGB 94.0 g',
      'Na2SO4 24.000 kg',
      'Soda Ash 9.600 kg',
    ]);
    expect((await get('/batches/B-24187')).json().status).toBe('WEIGHING');
  });

  it('starting again returns the existing session (200), no duplicate', async () => {
    app = await buildTestApp();
    await signIn();
    const first = (await start()).json<SessionView>();
    const again = await start('b-24187');
    expect(again.statusCode).toBe(200);
    expect(again.json<SessionView>().sessionId).toBe(first.sessionId);
  });

  it('B-24190 QUEUED → 409 BATCH_NOT_RELEASED; unknown batch → 404', async () => {
    app = await buildTestApp();
    await signIn();
    const res = await start('B-24190');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'BATCH_NOT_RELEASED',
      details: { reason: 'Not released by OrgaTEX' },
    });
    expect((await start('B-99999')).statusCode).toBe(404);
    expect((await get('/sessions/current')).json()).toEqual({ session: null });
  });

  it('another batch while one is in progress → 409 SESSION_IN_PROGRESS (ADR-3)', async () => {
    app = await buildTestApp();
    await signIn();
    await start();
    const res = await start('B-24188');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SESSION_IN_PROGRESS');
  });

  it('after a server restart, GET /api/sessions/current returns the session with the same states (NFR-6)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'weighingms-restart-'));
    const files = {
      orgatexDbFile: path.join(dir, 'orgatex.db'),
      weighingDbFile: path.join(dir, 'weighingms.db'),
    };
    const build = () =>
      buildApp({ config: testConfig(), ...files, orgatexHttpClient: (a) => injectHttpClient(a) });
    try {
      app = await build();
      await signIn();
      const s = (await start()).json<SessionView>();
      await post(`/sessions/${s.sessionId}/components/3/activate`);
      await app.close();

      app = await build();
      const after = (await get('/sessions/current')).json().session as SessionView;
      expect(after.sessionId).toBe(s.sessionId);
      expect(after.activeSequence).toBe(3);
      expect(states(after)).toEqual(['PENDING', 'PENDING', 'ACTIVE', 'PENDING', 'PENDING']);
      expect((await get('/operators/current')).json().operator.name).toBe('R. Karim');
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('carried from bolt 005: with OrgaTEX offline, a session in progress can be resumed and read', async () => {
    app = await buildTestApp();
    await signIn();
    const s = (await start()).json<SessionView>();
    await app.inject({ method: 'POST', url: '/ext/orgatex/_sim/offline' });
    expect((await get('/batches')).statusCode).toBe(503); // OrgaTEX really is down
    const resumed = await start();
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json<SessionView>().sessionId).toBe(s.sessionId);
    expect((await get(`/sessions/${s.sessionId}`)).statusCode).toBe(200);
    expect((await get('/sessions/current')).json().session.sessionId).toBe(s.sessionId);
    expect((await post(`/sessions/${s.sessionId}/components/2/activate`)).statusCode).toBe(200);
  });

  it('OrgaTEX offline: a new batch cannot be started (release check needs OrgaTEX) → 503', async () => {
    app = await buildTestApp();
    await signIn();
    await app.inject({ method: 'POST', url: '/ext/orgatex/_sim/offline' });
    const res = await start();
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ORGATEX_UNAVAILABLE');
  });
});

describe('Story 003 — component states and activation', () => {
  it('activating 3 makes it ACTIVE and returns component 1 to PENDING; exactly one ACTIVE', async () => {
    app = await buildTestApp();
    await signIn();
    const s = (await start()).json<SessionView>();
    const res = await post(`/sessions/${s.sessionId}/components/3/activate`);
    expect(res.statusCode).toBe(200);
    const after = res.json<SessionView>();
    expect(states(after)).toEqual(['PENDING', 'PENDING', 'ACTIVE', 'PENDING', 'PENDING']);
    expect(states(after).filter((x) => x === 'ACTIVE')).toHaveLength(1);
    expect((await get(`/sessions/${s.sessionId}`)).json<SessionView>().activeSequence).toBe(3);
  });

  it('a DONE component → 409 COMPONENT_ALREADY_DONE', async () => {
    app = await buildTestApp();
    await signIn();
    const s = (await start()).json<SessionView>();
    // DONE is reached by confirmation (bolt 010); here it is set through the repository.
    const session = app.weighing.ctx.sessions.findById(s.sessionId)!;
    const props = session.snapshot();
    props.components[0]!.state = 'DONE';
    props.components[1]!.state = 'ACTIVE';
    app.weighing.ctx.sessions.save(WeighingSession.restore(props));
    const res = await post(`/sessions/${s.sessionId}/components/1/activate`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('COMPONENT_ALREADY_DONE');
  });

  it('unknown component → 404; invalid sequence → 400; unknown session → 404', async () => {
    app = await buildTestApp();
    await signIn();
    const s = (await start()).json<SessionView>();
    expect((await post(`/sessions/${s.sessionId}/components/9/activate`)).json().error.code).toBe(
      'COMPONENT_NOT_FOUND',
    );
    expect((await post(`/sessions/${s.sessionId}/components/x/activate`)).statusCode).toBe(400);
    expect((await get('/sessions/nope')).json().error.code).toBe('SESSION_NOT_FOUND');
    expect((await post('/sessions/nope/components/1/activate')).statusCode).toBe(404);
  });
});

describe('Story 015 — audit trail', () => {
  it('lists the session’s events in order with actor names; unknown session → 404', async () => {
    app = await buildTestApp();
    await signIn();
    const s = (await start()).json<SessionView>();
    app.weighing.auditLog.record('ABANDON', 'OP-0417', s.sessionId, { sequence: 1 });
    app.weighing.auditLog.record('REPRINT', 'OP-0417', s.sessionId, {});
    const items = (await get(`/sessions/${s.sessionId}/audit`)).json().items;
    expect(
      items.map((e: { type: string; actor: { name: string } }) => [e.type, e.actor.name]),
    ).toEqual([
      ['ABANDON', 'R. Karim'],
      ['REPRINT', 'R. Karim'],
    ]);
    expect((await get('/sessions/nope/audit')).statusCode).toBe(404);
  });

  it('no endpoint updates or deletes audit events', async () => {
    app = await buildTestApp();
    await signIn();
    const s = (await start()).json<SessionView>();
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: `/api/sessions/${s.sessionId}/audit` });
      expect(res.statusCode, method).toBe(404);
    }
  });
});
