import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { injectHttpClient } from '../../app';
import { buildTestApp } from '../../test-support';
import {
  fetchHttpClient,
  HttpOrgatexAdapter,
  type AdapterLogger,
  type HttpClient,
} from './http-orgatex-adapter';

interface LogLine {
  level: 'info' | 'warn';
  obj: Record<string, unknown>;
}

function recordingLogger(): AdapterLogger & { lines: LogLine[] } {
  const lines: LogLine[] = [];
  return {
    lines,
    info: (obj) => lines.push({ level: 'info', obj: obj as Record<string, unknown> }),
    warn: (obj) => lines.push({ level: 'warn', obj: obj as Record<string, unknown> }),
  };
}

const FIXED_NOW = new Date('2026-10-15T06:12:00Z');

function adapterWith(client: HttpClient, timeoutMs = 200) {
  const logger = recordingLogger();
  const adapter = new HttpOrgatexAdapter({ client, timeoutMs, logger, now: () => FIXED_NOW });
  return { adapter, logger };
}

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => app.close());

describe('HttpOrgatexAdapter against the in-process Dummy OrgaTEX', () => {
  it('maps the queue to port types and stamps the received time', async () => {
    const { adapter } = adapterWith(injectHttpClient(app));
    const queue = await adapter.listBatches('STN-01');
    expect(queue.receivedAt).toBe('2026-10-15T06:12:00.000Z');
    expect(queue.batches[0]).toEqual({
      batchId: 'B-24187',
      orderRef: 'SO-9931',
      machineRef: 'JET-04',
      fabricDesc: '100% CTN knit',
      fabricWeight: { value: '480', unit: 'kg' },
      shade: 'Teal 4C',
      componentCount: 5,
      status: 'RELEASED',
      hasRecipe: true,
      releasedAt: '2026-08-04T06:05:00Z',
    });
    expect(queue.batches[2]?.hasRecipe).toBe(false);
  });

  it('maps a batch, a recipe and lots', async () => {
    const { adapter } = adapterWith(injectHttpClient(app));
    expect((await adapter.getBatch('B-24188')).machineRef).toBe('JET-07');
    const recipe = await adapter.getRecipe('B-24187');
    expect(recipe.components).toHaveLength(5);
    expect(recipe.components[2]).toMatchObject({
      sequence: 3,
      dyestuff: { code: 'DYE-4471', name: 'Remazol Yellow RGB' },
      target: { value: '94.0', unit: 'g' },
      tolerance: { value: '0.5', unit: 'g' },
      suggestedLotId: '2026-0387',
    });
    expect(await adapter.listLots('DYE-1180')).toEqual([
      { lotId: '2026-0341', dyestuffCode: 'DYE-1180' },
    ]);
  });

  it.each([
    ['getBatch', 'B-99999', 'BATCH_NOT_FOUND'],
    ['getRecipe', 'B-24190', 'RECIPE_NOT_FOUND'],
    ['getRecipe', 'B-99999', 'BATCH_NOT_FOUND'],
    ['listLots', 'NOPE', 'DYESTUFF_NOT_FOUND'],
  ] as const)('%s(%s) raises %s', async (op, arg, code) => {
    const { adapter } = adapterWith(injectHttpClient(app));
    await expect(adapter[op](arg)).rejects.toMatchObject({ code, httpStatus: 404 });
  });

  it('reports ONLINE with the last contact time after a successful call', async () => {
    const { adapter } = adapterWith(injectHttpClient(app));
    expect(adapter.getLinkStatus()).toEqual({ state: 'UNKNOWN', lastContactAt: null });
    await adapter.getBatch('B-24187');
    expect(adapter.getLinkStatus()).toEqual({
      state: 'ONLINE',
      lastContactAt: '2026-10-15T06:12:00.000Z',
    });
  });

  it('logs one structured line per call with operation, batch ID and outcome (IR-09)', async () => {
    const { adapter, logger } = adapterWith(injectHttpClient(app));
    await adapter.getRecipe('B-24187');
    await adapter.getBatch('B-99999').catch(() => undefined);
    expect(logger.lines).toHaveLength(2);
    expect(logger.lines[0]?.obj).toMatchObject({
      system: 'orgatex',
      operation: 'getRecipe',
      batchId: 'B-24187',
      outcome: 'ok',
    });
    expect(logger.lines[1]?.obj).toMatchObject({
      operation: 'getBatch',
      batchId: 'B-99999',
      outcome: 'not-found',
    });
    expect(typeof logger.lines[0]?.obj.durationMs).toBe('number');
  });
});

describe('HttpOrgatexAdapter failure handling', () => {
  it('raises ORGATEX_UNAVAILABLE when OrgaTEX is unreachable and marks the link OFFLINE', async () => {
    // Port 9 (discard) on localhost: connection refused.
    const { adapter, logger } = adapterWith(
      fetchHttpClient('http://127.0.0.1:9/ext/orgatex'),
      1000,
    );
    await expect(adapter.listBatches('STN-01')).rejects.toMatchObject({
      code: 'ORGATEX_UNAVAILABLE',
      httpStatus: 503,
    });
    expect(adapter.getLinkStatus().state).toBe('OFFLINE');
    expect(logger.lines[0]).toMatchObject({ level: 'warn', obj: { outcome: 'unavailable' } });
  });

  it('raises ORGATEX_UNAVAILABLE when OrgaTEX does not answer within the timeout', async () => {
    const hanging: HttpClient = { request: () => new Promise(() => undefined) };
    const { adapter } = adapterWith(hanging, 50);
    const started = Date.now();
    await expect(adapter.getRecipe('B-24187')).rejects.toMatchObject({
      code: 'ORGATEX_UNAVAILABLE',
    });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('raises ORGATEX_UNAVAILABLE on a 5xx answer', async () => {
    const failing: HttpClient = { request: async () => ({ status: 503, body: null }) };
    const { adapter } = adapterWith(failing);
    await expect(adapter.getBatch('B-24187')).rejects.toMatchObject({
      code: 'ORGATEX_UNAVAILABLE',
    });
  });

  it('raises ORGATEX_PROTOCOL_ERROR on a malformed payload', async () => {
    const garbage: HttpClient = {
      request: async () => ({ status: 200, body: { unexpected: true } }),
    };
    const { adapter } = adapterWith(garbage);
    await expect(adapter.listBatches('STN-01')).rejects.toMatchObject({
      code: 'ORGATEX_PROTOCOL_ERROR',
      httpStatus: 502,
    });
  });

  it('keeps the last contact time when the link goes OFFLINE', async () => {
    let up = true;
    const flaky: HttpClient = {
      request: async (r, s) => {
        if (!up) throw new Error('ECONNREFUSED');
        return injectHttpClient(app).request(r, s);
      },
    };
    const { adapter } = adapterWith(flaky);
    await adapter.getBatch('B-24187');
    up = false;
    await adapter.getBatch('B-24187').catch(() => undefined);
    expect(adapter.getLinkStatus()).toEqual({
      state: 'OFFLINE',
      lastContactAt: '2026-10-15T06:12:00.000Z',
    });
  });
});
