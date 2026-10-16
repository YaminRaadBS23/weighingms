import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ScanEvent, ScanFeedResponse } from '../../../shared/peripherals';
import { buildApp, injectHttpClient } from '../../app';
import { fetchHttpClient } from '../../integrations/http';
import { buildTestApp, testConfig } from '../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const api = (method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url: `/api${url}`, ...(payload ? { payload } : {}) });
const scan = (code: string) =>
  app.inject({ method: 'POST', url: '/ext/scanner/_sim/scan', payload: { code } });

describe('/api/scanner', () => {
  it('a scanned B-24187 is delivered once with kind BATCH', async () => {
    app = await buildTestApp();
    await scan('B-24187');
    const first = (await api('GET', '/scanner/scans?since=0')).json<ScanFeedResponse>();
    expect(first.items).toEqual([
      { seq: 1, code: 'B-24187', kind: 'BATCH', source: 'SCANNER', at: expect.any(String) },
    ]);
    const next = (
      await api('GET', `/scanner/scans?since=${first.cursor}`)
    ).json<ScanFeedResponse>();
    expect(next).toEqual({ items: [], cursor: 1 });
  });

  it('DYE-4471, 2026-0387, C-12 and a badge classify as DYESTUFF, LOT, CONTAINER, BADGE', async () => {
    app = await buildTestApp();
    for (const c of ['DYE-4471', '2026-0387', 'C-12', 'BDG-0417']) await scan(c);
    const feed = (await api('GET', '/scanner/scans?since=0')).json<ScanFeedResponse>();
    expect(feed.items.map((e) => [e.code, e.kind])).toEqual([
      ['DYE-4471', 'DYESTUFF'],
      ['2026-0387', 'LOT'],
      ['C-12', 'CONTAINER'],
      ['BDG-0417', 'BADGE'],
    ]);
  });

  it('scanned codes are normalised (trim, upper case)', async () => {
    app = await buildTestApp();
    await scan('  dye-4471 ');
    const [e] = (await api('GET', '/scanner/scans?since=0')).json<ScanFeedResponse>().items;
    expect(e).toMatchObject({ code: 'DYE-4471', kind: 'DYESTUFF' });
  });

  it('scanner offline: status OFFLINE and no scans delivered (503 SCANNER_UNAVAILABLE)', async () => {
    app = await buildTestApp();
    await scan('B-24187');
    await app.inject({ method: 'POST', url: '/ext/scanner/_sim/offline' });
    expect((await api('GET', '/scanner/status')).json()).toEqual({ state: 'OFFLINE' });
    const res = await api('GET', '/scanner/scans?since=0');
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('SCANNER_UNAVAILABLE');
  });

  it('typed entry works while the scanner is offline and is classified identically', async () => {
    app = await buildTestApp();
    await app.inject({ method: 'POST', url: '/ext/scanner/_sim/offline' });
    for (const [code, kind] of [
      ['b-24187', 'BATCH'],
      [' DYE-4471', 'DYESTUFF'],
      ['2026-0387', 'LOT'],
      ['c-12', 'CONTAINER'],
      ['BDG-0417', 'BADGE'],
    ]) {
      const e = (await api('POST', '/scanner/manual', { code })).json<ScanEvent>();
      expect(e).toEqual({
        seq: null,
        code: code!.trim().toUpperCase(),
        kind,
        source: 'MANUAL',
        at: expect.any(String),
      });
    }
  });

  it('typed entry rejects an empty code with 400', async () => {
    app = await buildTestApp();
    expect((await api('POST', '/scanner/manual', { code: '   ' })).statusCode).toBe(400);
  });

  it('an invalid since parameter is treated as 0', async () => {
    app = await buildTestApp();
    await scan('C-12');
    expect(
      (await api('GET', '/scanner/scans?since=abc')).json<ScanFeedResponse>().items,
    ).toHaveLength(1);
  });
});

describe('/api/printer/status', () => {
  it.each(['READY', 'OFFLINE', 'OUT_OF_PAPER'])('reports %s', async (state) => {
    app = await buildTestApp();
    await app.inject({ method: 'POST', url: '/ext/printer/_sim/state', payload: { state } });
    expect((await api('GET', '/printer/status')).json()).toEqual({ state });
  });

  it('reports OFFLINE (not an error) when the printer cannot be reached at all', async () => {
    app = await buildApp({
      config: testConfig(),
      orgatexDbFile: ':memory:',
      weighingDbFile: ':memory:',
      orgatexHttpClient: (a) => injectHttpClient(a),
      printerHttpClient: () => fetchHttpClient('http://127.0.0.1:9/ext/printer'),
    });
    const res = await api('GET', '/printer/status');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: 'OFFLINE' });
  });
});
