import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fetchHttpClient, injectHttpClient, type HttpClient } from '../http';
import { buildTestApp } from '../../test-support';
import { HttpPrinterAdapter } from './http-printer-adapter';

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildTestApp();
});
afterEach(async () => app.close());

function adapter(client?: HttpClient, timeoutMs = 200) {
  const lines: { level: string; obj: Record<string, unknown> }[] = [];
  const rec = (level: string) => (obj: object) =>
    lines.push({ level, obj: obj as Record<string, unknown> });
  const printer = new HttpPrinterAdapter({
    client: client ?? injectHttpClient(app, '/ext/printer'),
    timeoutMs,
    logger: { debug: rec('debug'), info: rec('info'), warn: rec('warn') },
  });
  return { printer, lines };
}

const doc = { documentId: 'T-1', lines: ['BATCH   B-24187'], barcode: 'B-24187' };

describe('HttpPrinterAdapter', () => {
  it('prints (logged at info), returns the result and lists jobs', async () => {
    const { printer, lines } = adapter();
    expect(await printer.getStatus()).toBe('READY');
    const result = await printer.print(doc);
    expect(result).toMatchObject({
      documentId: 'T-1',
      preview: 'BATCH   B-24187\n[barcode: B-24187]',
    });
    expect(await printer.listJobs()).toEqual([result]);
    expect(lines.find((l) => l.obj.operation === 'print')).toMatchObject({
      level: 'info',
      obj: { documentId: 'T-1', outcome: 'ok' },
    });
  });

  it.each(['OFFLINE', 'OUT_OF_PAPER'] as const)(
    'printer %s → PRINTER_UNAVAILABLE (503) carrying the state',
    async (state) => {
      await app.inject({ method: 'POST', url: '/ext/printer/_sim/state', payload: { state } });
      const { printer } = adapter();
      expect(await printer.getStatus()).toBe(state);
      await expect(printer.print(doc)).rejects.toMatchObject({
        code: 'PRINTER_UNAVAILABLE',
        httpStatus: 503,
        state,
        details: expect.objectContaining({ state }),
      });
    },
  );

  it('timeout and connection refused → PRINTER_UNAVAILABLE (OFFLINE)', async () => {
    const hanging: HttpClient = { request: () => new Promise(() => undefined) };
    await expect(adapter(hanging, 50).printer.print(doc)).rejects.toMatchObject({
      code: 'PRINTER_UNAVAILABLE',
      state: 'OFFLINE',
    });
    await expect(
      adapter(fetchHttpClient('http://127.0.0.1:9/ext/printer'), 1000).printer.getStatus(),
    ).rejects.toMatchObject({ code: 'PRINTER_UNAVAILABLE' });
  });

  it('malformed job → DEVICE_PROTOCOL_ERROR (502)', async () => {
    const garbage: HttpClient = { request: async () => ({ status: 200, body: {} }) };
    await expect(adapter(garbage).printer.print(doc)).rejects.toMatchObject({
      code: 'DEVICE_PROTOCOL_ERROR',
    });
  });
});
