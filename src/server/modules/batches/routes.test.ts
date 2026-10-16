import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  BatchDetailResponse,
  BatchQueueResponse,
  RecipeResponse,
} from '../../../shared/batches';
import type { OrgatexSeed } from '../../integrations/orgatex/dummy/seed';
import { buildTestApp } from '../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const api = (url: string) => app.inject({ method: 'GET', url: `/api${url}` });
const setStatus = (batchId: string, status: string) =>
  app.inject({
    method: 'PATCH',
    url: `/ext/orgatex/batches/${batchId}/status`,
    payload: { status },
  });
const orgatexSim = (action: string) =>
  app.inject({ method: 'POST', url: `/ext/orgatex/_sim/${action}` });

describe('GET /api/batches', () => {
  it('lists the four prototype batches with queue fields, selectable, reason and received time', async () => {
    app = await buildTestApp();
    const res = await api('/batches');
    expect(res.statusCode).toBe(200);
    const body = res.json<BatchQueueResponse>();
    expect(Date.parse(body.receivedAt)).not.toBeNaN();
    expect(
      body.items.map((b) => [
        b.batchId,
        b.orderRef,
        b.machineRef,
        `${b.fabric.description} · ${b.fabric.weight.value} ${b.fabric.weight.unit}`,
        b.shade,
        b.componentCount,
        b.status,
        b.selectable,
        b.reason,
      ]),
    ).toEqual([
      [
        'B-24187',
        'SO-9931',
        'JET-04',
        '100% CTN knit · 480 kg',
        'Teal 4C',
        5,
        'RELEASED',
        true,
        null,
      ],
      [
        'B-24188',
        'SO-9931',
        'JET-07',
        '100% CTN knit · 520 kg',
        'Teal 4C',
        5,
        'RELEASED',
        true,
        null,
      ],
      [
        'B-24190',
        'SO-9944',
        'JET-02',
        'CVC fleece · 310 kg',
        'Navy 12',
        7,
        'QUEUED',
        false,
        'Not released by OrgaTEX',
      ],
      [
        'B-24191',
        'SO-9947',
        'WINCH-01',
        'Viscose jersey · 190 kg',
        'Rose 08',
        4,
        'QUEUED',
        false,
        'Not released by OrgaTEX',
      ],
    ]);
  });

  it('a WEIGHED batch is "Already weighed"; a WEIGHING batch stays selectable (resume)', async () => {
    app = await buildTestApp();
    await setStatus('B-24187', 'WEIGHED');
    await setStatus('B-24188', 'WEIGHING');
    const items = (await api('/batches')).json<BatchQueueResponse>().items;
    expect(items.find((b) => b.batchId === 'B-24187')).toMatchObject({
      selectable: false,
      reason: 'Already weighed',
    });
    expect(items.find((b) => b.batchId === 'B-24188')).toMatchObject({
      status: 'WEIGHING',
      selectable: true,
      reason: null,
    });
  });
});

describe('GET /api/batches/:batchId', () => {
  it('returns the detail of B-24187 with selectable: true', async () => {
    app = await buildTestApp();
    const res = await api('/batches/B-24187');
    expect(res.statusCode).toBe(200);
    expect(res.json<BatchDetailResponse>()).toEqual({
      batchId: 'B-24187',
      orderRef: 'SO-9931',
      machineRef: 'JET-04',
      fabric: { description: '100% CTN knit', weight: { value: '480', unit: 'kg' } },
      shade: 'Teal 4C',
      componentCount: 5,
      status: 'RELEASED',
      selectable: true,
      reason: null,
      releasedAt: '2026-08-04T06:05:00Z',
    });
  });

  it('resolves a scanned lower-case ID', async () => {
    app = await buildTestApp();
    expect((await api('/batches/b-24187')).json<BatchDetailResponse>().batchId).toBe('B-24187');
  });

  it('B-24190 detail is returned but not selectable', async () => {
    app = await buildTestApp();
    expect((await api('/batches/B-24190')).json<BatchDetailResponse>()).toMatchObject({
      selectable: false,
      reason: 'Not released by OrgaTEX',
    });
  });

  it('unknown batch → 404 BATCH_NOT_FOUND', async () => {
    app = await buildTestApp();
    const res = await api('/batches/B-99999');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('BATCH_NOT_FOUND');
  });

  it('the release check used at session start refuses B-24190 with 409 BATCH_NOT_RELEASED', async () => {
    app = await buildTestApp();
    await expect(app.batches.requireWeighable('B-24190')).rejects.toMatchObject({
      code: 'BATCH_NOT_RELEASED',
      httpStatus: 409,
      details: { reason: 'Not released by OrgaTEX' },
    });
    await expect(app.batches.requireWeighable('b-24187')).resolves.toMatchObject({
      batchId: 'B-24187',
    });
  });
});

describe('GET /api/batches/:batchId/recipe', () => {
  it('returns Teal 4C with the five components in sequence, equal to the seed', async () => {
    app = await buildTestApp();
    const started = performance.now();
    const res = await api('/batches/B-24187/recipe');
    const elapsedMs = performance.now() - started;
    expect(res.statusCode).toBe(200);
    expect(elapsedMs).toBeLessThan(3000);
    const recipe = res.json<RecipeResponse>();
    expect(recipe).toMatchObject({ batchId: 'B-24187', recipeId: 'RCP-TEAL-4C', shade: 'Teal 4C' });

    const seed = JSON.parse(
      readFileSync(path.resolve('data/seed/orgatex-seed.json'), 'utf8'),
    ) as OrgatexSeed;
    const dyes = new Map(seed.dyestuffs.map((d) => [d.code, d]));
    expect(recipe.components).toEqual(
      seed.recipes[0]!.components.map((c) => ({
        sequence: c.sequence,
        dyestuff: {
          code: c.dyestuffCode,
          name: dyes.get(c.dyestuffCode)!.name,
          shortName: dyes.get(c.dyestuffCode)!.ticketShortName,
          colourHex: dyes.get(c.dyestuffCode)!.colourHex,
          type: dyes.get(c.dyestuffCode)!.type,
        },
        target: c.target,
        tolerance: c.tolerance,
        barMax: c.barMax,
        suggestedLotId: c.suggestedLot,
      })),
    );
    expect(
      recipe.components.map((c) => `${c.dyestuff.shortName} ${c.target.value} ${c.target.unit}`),
    ).toEqual([
      'Blue RSPL 1240.0 g',
      'Red RB 386.0 g',
      'Yellow RGB 94.0 g',
      'Na2SO4 24.000 kg',
      'Soda Ash 9.600 kg',
    ]);
  });

  it('a batch without a recipe → 404 RECIPE_NOT_FOUND; unknown → 404 BATCH_NOT_FOUND', async () => {
    app = await buildTestApp();
    expect((await api('/batches/B-24190/recipe')).json().error.code).toBe('RECIPE_NOT_FOUND');
    expect((await api('/batches/B-99999/recipe')).json().error.code).toBe('BATCH_NOT_FOUND');
  });
});

describe('OrgaTEX unavailable when loading', () => {
  it('queue, detail and recipe answer 503 ORGATEX_UNAVAILABLE (never an empty queue), then recover', async () => {
    app = await buildTestApp();
    await orgatexSim('offline');
    for (const url of ['/batches', '/batches/B-24187', '/batches/B-24187/recipe']) {
      const res = await api(url);
      expect(res.statusCode, url).toBe(503);
      expect(res.json().error.code).toBe('ORGATEX_UNAVAILABLE');
      expect(res.json().items).toBeUndefined();
    }
    await orgatexSim('online');
    expect((await api('/batches')).json<BatchQueueResponse>().items).toHaveLength(4);
    expect((await api('/batches/B-24187/recipe')).statusCode).toBe(200);
  });
});
