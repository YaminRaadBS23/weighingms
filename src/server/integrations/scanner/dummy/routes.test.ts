import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-support';
import type { DummyScanFeed } from './contract';

let app: FastifyInstance;
afterEach(async () => app?.close());

const get = (url: string) => app.inject({ method: 'GET', url: `/ext/scanner${url}` });
const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/ext/scanner${url}`, ...(payload ? { payload } : {}) });

describe('Dummy Scanner contract (training)', () => {
  it('status READY; feed empty with cursor 0 initially', async () => {
    app = await buildTestApp();
    expect((await get('/status')).json()).toEqual({ state: 'READY' });
    expect((await get('/scans?since=0')).json()).toEqual({ items: [], cursor: 0 });
  });

  it('records raw scans in order with sequence numbers; since filters older ones', async () => {
    app = await buildTestApp();
    const first = (await post('/_sim/scan', { code: 'B-24187' })).json();
    expect(first).toMatchObject({ seq: 1, code: 'B-24187' });
    await post('/_sim/scan', { code: ' dye-4471 ' });
    const all = (await get('/scans?since=0')).json<DummyScanFeed>();
    expect(all.items.map((s) => [s.seq, s.code])).toEqual([
      [1, 'B-24187'],
      [2, ' dye-4471 '],
    ]);
    expect(all.cursor).toBe(2);
    expect((await get('/scans?since=2')).json()).toEqual({ items: [], cursor: 2 });
    expect((await get('/scans?since=1')).json<DummyScanFeed>().items).toHaveLength(1);
  });

  it('offline: status OFFLINE, feed 503 SCANNER_OFFLINE, simulated scan refused (409)', async () => {
    app = await buildTestApp();
    await post('/_sim/offline');
    expect((await get('/status')).json()).toEqual({ state: 'OFFLINE' });
    const feed = await get('/scans?since=0');
    expect(feed.statusCode).toBe(503);
    expect(feed.json().error.code).toBe('SCANNER_OFFLINE');
    expect((await post('/_sim/scan', { code: 'B-24187' })).statusCode).toBe(409);
    await post('/_sim/online');
    expect((await get('/scans?since=0')).statusCode).toBe(200);
  });

  it('reset clears scans and goes online', async () => {
    app = await buildTestApp();
    await post('/_sim/scan', { code: 'B-24187' });
    await post('/_sim/offline');
    await post('/_sim/reset');
    expect((await get('/scans?since=0')).json()).toEqual({ items: [], cursor: 0 });
  });

  it('rejects an empty simulated scan with 400', async () => {
    app = await buildTestApp();
    expect((await post('/_sim/scan', { code: '  ' })).statusCode).toBe(400);
  });

  it('production configuration: _sim endpoints are not registered (404)', async () => {
    app = await buildTestApp({ env: 'production', enableSimulation: false });
    for (const url of ['/_sim/scan', '/_sim/offline', '/_sim/online', '/_sim/reset']) {
      expect((await post(url, { code: 'B-24187' })).statusCode).toBe(404);
    }
    expect((await get('/status')).statusCode).toBe(200);
  });
});
