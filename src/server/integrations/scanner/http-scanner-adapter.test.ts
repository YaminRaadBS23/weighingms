import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fetchHttpClient, injectHttpClient, type HttpClient } from '../http';
import { buildTestApp } from '../../test-support';
import { HttpScannerAdapter } from './http-scanner-adapter';

const quiet = { debug: () => {}, info: () => {}, warn: () => {} };
let app: FastifyInstance;
beforeEach(async () => {
  app = await buildTestApp();
});
afterEach(async () => app.close());

const adapter = (client?: HttpClient, timeoutMs = 200) =>
  new HttpScannerAdapter({
    client: client ?? injectHttpClient(app, '/ext/scanner'),
    timeoutMs,
    logger: quiet,
  });

describe('HttpScannerAdapter', () => {
  it('maps status and raw scans with the cursor', async () => {
    await app.inject({ method: 'POST', url: '/ext/scanner/_sim/scan', payload: { code: 'C-12' } });
    const scanner = adapter();
    expect(await scanner.getStatus()).toBe('READY');
    const feed = await scanner.scansSince(0);
    expect(feed.cursor).toBe(1);
    expect(feed.scans).toEqual([{ seq: 1, code: 'C-12', at: expect.any(String) }]);
  });

  it('offline scanner: status OFFLINE, feed → SCANNER_UNAVAILABLE (503)', async () => {
    await app.inject({ method: 'POST', url: '/ext/scanner/_sim/offline' });
    const scanner = adapter();
    expect(await scanner.getStatus()).toBe('OFFLINE');
    await expect(scanner.scansSince(0)).rejects.toMatchObject({
      code: 'SCANNER_UNAVAILABLE',
      httpStatus: 503,
    });
  });

  it('timeout and connection refused → SCANNER_UNAVAILABLE', async () => {
    const hanging: HttpClient = { request: () => new Promise(() => undefined) };
    await expect(adapter(hanging, 50).scansSince(0)).rejects.toMatchObject({
      code: 'SCANNER_UNAVAILABLE',
    });
    await expect(
      adapter(fetchHttpClient('http://127.0.0.1:9/ext/scanner'), 1000).getStatus(),
    ).rejects.toMatchObject({ code: 'SCANNER_UNAVAILABLE' });
  });

  it('malformed feed → DEVICE_PROTOCOL_ERROR (502)', async () => {
    const garbage: HttpClient = { request: async () => ({ status: 200, body: { nope: 1 } }) };
    await expect(adapter(garbage).scansSince(0)).rejects.toMatchObject({
      code: 'DEVICE_PROTOCOL_ERROR',
      httpStatus: 502,
    });
  });
});
