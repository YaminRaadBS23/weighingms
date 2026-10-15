import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { injectHttpClient } from '../../app';
import { buildTestApp, prototypePosting } from '../../test-support';
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

describe('HttpOrgatexAdapter write operations', () => {
  let w: FastifyInstance;
  beforeEach(async () => {
    w = await buildTestApp();
  });
  afterEach(async () => w.close());

  it('postConsumption returns the mapped receipt and is idempotent through the port', async () => {
    const { adapter, logger } = adapterWith(injectHttpClient(w));
    const first = await adapter.postConsumption('B-24187', prototypePosting(), 'K-1');
    expect(first).toMatchObject({ batchId: 'B-24187', idempotencyKey: 'K-1' });
    expect(first.lines.map((l) => [l.dyestuffCode, l.actual.value, l.actual.unit])).toEqual([
      ['DYE-1180', '1241.5', 'g'],
      ['DYE-2204', '385.4', 'g'],
      ['DYE-4471', '94.2', 'g'],
      ['AUX-0101', '23.980', 'kg'],
      ['AUX-0107', '9.621', 'kg'],
    ]);
    const retry = await adapter.postConsumption('B-24187', prototypePosting(), 'K-1');
    expect(retry).toEqual(first);
    const stored = await w.inject({
      method: 'GET',
      url: '/ext/orgatex/batches/B-24187/consumption',
    });
    expect(stored.json().items).toHaveLength(1);
    expect(logger.lines.at(-1)?.obj).toMatchObject({
      operation: 'postConsumption',
      batchId: 'B-24187',
      idempotencyKey: 'K-1',
      outcome: 'ok',
    });
  });

  it('setBatchStatus returns the updated batch', async () => {
    const { adapter } = adapterWith(injectHttpClient(w));
    expect((await adapter.setBatchStatus('B-24187', 'WEIGHING')).status).toBe('WEIGHING');
    expect((await adapter.setBatchStatus('B-24187', 'WEIGHED')).status).toBe('WEIGHED');
  });

  it.each([
    [
      'IDEMPOTENCY_CONFLICT',
      409,
      async (a: HttpOrgatexAdapter) => {
        await a.postConsumption('B-24187', prototypePosting(), 'K-1');
        await a.postConsumption('B-24187', prototypePosting({ operatorId: 'OP-OTHER' }), 'K-1');
      },
    ],
    [
      'BATCH_NOT_RELEASED',
      409,
      (a: HttpOrgatexAdapter) => a.postConsumption('B-24190', prototypePosting(), 'K-1'),
    ],
    [
      'CONSUMPTION_REJECTED',
      422,
      (a: HttpOrgatexAdapter) =>
        a.postConsumption('B-24187', prototypePosting({ lines: [] }), 'K-1'),
    ],
    [
      'INVALID_STATUS_TRANSITION',
      409,
      async (a: HttpOrgatexAdapter) => {
        await a.setBatchStatus('B-24187', 'WEIGHED');
        await a.setBatchStatus('B-24187', 'WEIGHING');
      },
    ],
    ['BATCH_NOT_RELEASED', 409, (a: HttpOrgatexAdapter) => a.setBatchStatus('B-24191', 'WEIGHING')],
    ['BATCH_NOT_FOUND', 404, (a: HttpOrgatexAdapter) => a.setBatchStatus('B-99999', 'WEIGHING')],
  ])(
    'translates an OrgaTEX %s answer into the matching domain error',
    async (code, status, act) => {
      const { adapter, logger } = adapterWith(injectHttpClient(w));
      await expect(act(adapter)).rejects.toMatchObject({ code, httpStatus: status });
      expect(adapter.getLinkStatus().state).toBe('ONLINE');
      expect(logger.lines.at(-1)?.obj.outcome).toBe(status === 404 ? 'not-found' : 'rejected');
    },
  );

  it('raises ORGATEX_PROTOCOL_ERROR for an unexpected 400 answer', async () => {
    const badRequest: HttpClient = {
      request: async () => ({ status: 400, body: { error: { code: 'VALIDATION_ERROR' } } }),
    };
    const { adapter } = adapterWith(badRequest);
    await expect(adapter.setBatchStatus('B-24187', 'WEIGHING')).rejects.toMatchObject({
      code: 'ORGATEX_PROTOCOL_ERROR',
    });
  });

  it('sends the Idempotency-Key header and JSON body over real fetch', async () => {
    let seen: { method?: string; key?: string; body?: unknown } = {};
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      seen = {
        method: init.method,
        key: (init.headers as Record<string, string>)['idempotency-key'],
        body: JSON.parse(String(init.body)),
      };
      return new Response(JSON.stringify({ error: { code: 'BATCH_NOT_RELEASED' } }), {
        status: 409,
      });
    }) as typeof fetch;
    try {
      const { adapter } = adapterWith(fetchHttpClient('http://orgatex.test/ext/orgatex'));
      await expect(
        adapter.postConsumption('B-24190', prototypePosting(), 'K-9'),
      ).rejects.toMatchObject({
        code: 'BATCH_NOT_RELEASED',
      });
      expect(seen).toMatchObject({ method: 'POST', key: 'K-9', body: prototypePosting() });
    } finally {
      globalThis.fetch = original;
    }
  });
});
