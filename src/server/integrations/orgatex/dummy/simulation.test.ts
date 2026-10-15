import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, prototypePosting } from '../../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const sim = (action: string) => app.inject({ method: 'POST', url: `/ext/orgatex/_sim/${action}` });

const businessEndpoints = [
  ['GET', '/ext/orgatex/ping'],
  ['GET', '/ext/orgatex/stations/STN-01/batches'],
  ['GET', '/ext/orgatex/batches/B-24187'],
  ['GET', '/ext/orgatex/batches/B-24187/recipe'],
  ['GET', '/ext/orgatex/dyestuffs/DYE-4471/lots'],
  ['GET', '/ext/orgatex/batches/B-24187/consumption'],
  ['POST', '/ext/orgatex/batches/B-24187/consumption'],
  ['PATCH', '/ext/orgatex/batches/B-24187/status'],
] as const;

describe('Dummy OrgaTEX simulation controls (training only)', () => {
  it('offline: every business endpoint answers 503 ORGATEX_OFFLINE', async () => {
    app = await buildTestApp();
    expect((await sim('offline')).json()).toEqual({ online: false, postings: 0 });
    for (const [method, url] of businessEndpoints) {
      const res = await app.inject({
        method,
        url,
        headers: { 'idempotency-key': 'K' },
        payload: method === 'GET' ? undefined : { status: 'WEIGHING' },
      });
      expect(res.statusCode, `${method} ${url}`).toBe(503);
      expect(res.json().error.code).toBe('ORGATEX_OFFLINE');
    }
  });

  it('offline: OrgatexPort raises ORGATEX_UNAVAILABLE and reports the link OFFLINE', async () => {
    app = await buildTestApp();
    await app.orgatex.listBatches('STN-01');
    await sim('offline');
    await expect(app.orgatex.getRecipe('B-24187')).rejects.toMatchObject({
      code: 'ORGATEX_UNAVAILABLE',
      httpStatus: 503,
    });
    await expect(
      app.orgatex.postConsumption('B-24187', prototypePosting(), 'K-1'),
    ).rejects.toMatchObject({ code: 'ORGATEX_UNAVAILABLE' });
    expect(app.orgatex.getLinkStatus().state).toBe('OFFLINE');
  });

  it('online: endpoints answer normally again and the port recovers', async () => {
    app = await buildTestApp();
    await sim('offline');
    expect((await sim('online')).json().online).toBe(true);
    const res = await app.inject({ method: 'GET', url: '/ext/orgatex/batches/B-24187' });
    expect(res.statusCode).toBe(200);
    await app.orgatex.getBatch('B-24187');
    expect(app.orgatex.getLinkStatus().state).toBe('ONLINE');
  });

  it('reset: statuses back to the seed, postings removed, online', async () => {
    app = await buildTestApp();
    await app.orgatex.postConsumption('B-24187', prototypePosting(), 'K-1');
    await app.orgatex.setBatchStatus('B-24187', 'WEIGHED');
    await sim('offline');
    expect((await sim('reset')).json()).toEqual({ online: true, postings: 0 });
    expect((await app.orgatex.getBatch('B-24187')).status).toBe('RELEASED');
    const listed = await app.inject({
      method: 'GET',
      url: '/ext/orgatex/batches/B-24187/consumption',
    });
    expect(listed.json().items).toEqual([]);
  });

  it('state reports online flag and number of postings', async () => {
    app = await buildTestApp();
    await app.orgatex.postConsumption('B-24187', prototypePosting(), 'K-1');
    const res = await app.inject({ method: 'GET', url: '/ext/orgatex/_sim/state' });
    expect(res.json()).toEqual({ online: true, postings: 1 });
  });

  it('production configuration: _sim endpoints are not registered (404)', async () => {
    app = await buildTestApp({ env: 'production', enableSimulation: false });
    for (const action of ['offline', 'online', 'reset']) {
      expect((await sim(action)).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/ext/orgatex/_sim/state' })).statusCode).toBe(
      404,
    );
    // Business endpoints still work.
    expect(
      (await app.inject({ method: 'GET', url: '/ext/orgatex/batches/B-24187' })).statusCode,
    ).toBe(200);
  });
});
