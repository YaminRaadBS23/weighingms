import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { OrgatexStatusResponse } from '../../../shared/peripherals';
import { buildTestApp } from '../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const status = async () =>
  (await app.inject({ method: 'GET', url: '/api/orgatex/status' })).json<OrgatexStatusResponse>();
const sim = (action: string) => app.inject({ method: 'POST', url: `/ext/orgatex/_sim/${action}` });

describe('GET /api/orgatex/status', () => {
  it('reports ONLINE with the time of the last contact', async () => {
    app = await buildTestApp();
    const body = await status();
    expect(body.state).toBe('ONLINE');
    expect(Date.parse(body.lastContactAt ?? '')).not.toBeNaN();
  });

  it('reports OFFLINE (never an error) when OrgaTEX is down, keeping the last contact time', async () => {
    app = await buildTestApp();
    const online = await status();
    await sim('offline');
    const res = await app.inject({ method: 'GET', url: '/api/orgatex/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json<OrgatexStatusResponse>()).toEqual({
      state: 'OFFLINE',
      lastContactAt: online.lastContactAt,
    });
  });

  it('returns to ONLINE with a new contact time when OrgaTEX comes back', async () => {
    app = await buildTestApp();
    await sim('offline');
    expect((await status()).state).toBe('OFFLINE');
    await sim('online');
    const back = await status();
    expect(back.state).toBe('ONLINE');
    expect(back.lastContactAt).not.toBeNull();
  });
});

describe('OrgatexPort.ping', () => {
  it('refreshes the link status and never throws', async () => {
    app = await buildTestApp();
    expect(app.orgatex.getLinkStatus().state).toBe('UNKNOWN');
    expect((await app.orgatex.ping()).state).toBe('ONLINE');
    await sim('offline');
    await expect(app.orgatex.ping()).resolves.toMatchObject({ state: 'OFFLINE' });
  });
});
