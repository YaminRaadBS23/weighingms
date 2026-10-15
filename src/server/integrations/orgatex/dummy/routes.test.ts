import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-support';
import type { DummyBatchList, DummyLotList, DummyRecipe } from './contract';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => app.close());

const get = (url: string) => app.inject({ method: 'GET', url: `/ext/orgatex${url}` });

describe('Dummy OrgaTEX contract (training) — read endpoints', () => {
  it('GET /ping answers ok', async () => {
    const res = await get('/ping');
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /stations/STN-01/batches returns the prototype queue with TD-7 statuses', async () => {
    const res = await get('/stations/STN-01/batches');
    expect(res.statusCode).toBe(200);
    const body = res.json<DummyBatchList>();
    expect(typeof body.generatedAt).toBe('string');
    expect(
      body.items.map((b) => [
        b.batchId,
        b.orderRef,
        b.machineRef,
        `${b.fabricDesc} · ${b.fabricWeight.value} ${b.fabricWeight.unit}`,
        b.shade,
        b.componentCount,
        b.status,
      ]),
    ).toEqual([
      ['B-24187', 'SO-9931', 'JET-04', '100% CTN knit · 480 kg', 'Teal 4C', 5, 'RELEASED'],
      ['B-24188', 'SO-9931', 'JET-07', '100% CTN knit · 520 kg', 'Teal 4C', 5, 'RELEASED'],
      ['B-24190', 'SO-9944', 'JET-02', 'CVC fleece · 310 kg', 'Navy 12', 7, 'QUEUED'],
      ['B-24191', 'SO-9947', 'WINCH-01', 'Viscose jersey · 190 kg', 'Rose 08', 4, 'QUEUED'],
    ]);
  });

  it('GET /stations/:unknown/batches returns an empty list', async () => {
    const res = await get('/stations/STN-99/batches');
    expect(res.json<DummyBatchList>().items).toEqual([]);
  });

  it('GET /batches/B-24187 returns the batch', async () => {
    const res = await get('/batches/B-24187');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      batchId: 'B-24187',
      recipeId: 'RCP-TEAL-4C',
      status: 'RELEASED',
    });
  });

  it('GET /batches/B-24187/recipe returns the five components in sequence with exact values', async () => {
    const res = await get('/batches/B-24187/recipe');
    expect(res.statusCode).toBe(200);
    const recipe = res.json<DummyRecipe>();
    expect(recipe.shade).toBe('Teal 4C');
    expect(
      recipe.components.map((c) => [
        c.sequence,
        c.dyestuff.code,
        c.dyestuff.name,
        c.dyestuff.ticketShortName,
        c.dyestuff.colourHex,
        `${c.target.value} ${c.target.unit}`,
        `${c.tolerance.value} ${c.tolerance.unit}`,
        `${c.barMax.value} ${c.barMax.unit}`,
        c.suggestedLot,
      ]),
    ).toEqual([
      [
        1,
        'DYE-1180',
        'Remazol Brill. Blue RSPL',
        'Blue RSPL',
        '#1f4fa8',
        '1240.0 g',
        '6.0 g',
        '1600 g',
        '2026-0341',
      ],
      [
        2,
        'DYE-2204',
        'Remazol Red RB',
        'Red RB',
        '#b8253a',
        '386.0 g',
        '2.0 g',
        '520 g',
        '2026-0298',
      ],
      [
        3,
        'DYE-4471',
        'Remazol Yellow RGB',
        'Yellow RGB',
        '#d9a520',
        '94.0 g',
        '0.5 g',
        '125 g',
        '2026-0387',
      ],
      [
        4,
        'AUX-0101',
        'Sodium Sulphate',
        'Na2SO4',
        '#c9d2dc',
        '24.000 kg',
        '0.120 kg',
        '32 kg',
        '2026-0112',
      ],
      [
        5,
        'AUX-0107',
        'Soda Ash',
        'Soda Ash',
        '#e4eaf0',
        '9.600 kg',
        '0.048 kg',
        '14 kg',
        '2026-0155',
      ],
    ]);
  });

  it('returns every quantity as { value: string, unit }', async () => {
    const recipe = (await get('/batches/B-24187/recipe')).json<DummyRecipe>();
    for (const c of recipe.components) {
      for (const q of [c.target, c.tolerance, c.barMax]) {
        expect(typeof q.value).toBe('string');
        expect(['g', 'kg']).toContain(q.unit);
      }
    }
  });

  it('GET /dyestuffs/DYE-4471/lots returns 2026-0387 (and the training-only 2026-0402)', async () => {
    const res = await get('/dyestuffs/DYE-4471/lots');
    expect(res.statusCode).toBe(200);
    expect(res.json<DummyLotList>().items).toEqual([
      { lotId: '2026-0387', dyestuffCode: 'DYE-4471', trainingOnly: false },
      { lotId: '2026-0402', dyestuffCode: 'DYE-4471', trainingOnly: true },
    ]);
  });

  it.each([
    ['/batches/B-99999', 'BATCH_NOT_FOUND'],
    ['/batches/B-99999/recipe', 'BATCH_NOT_FOUND'],
    ['/batches/B-24190/recipe', 'RECIPE_NOT_FOUND'],
    ['/dyestuffs/NOPE/lots', 'DYESTUFF_NOT_FOUND'],
  ])('GET %s → 404 %s in the standard error body', async (url, code) => {
    const res = await get(url);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code, message: expect.any(String) } });
  });
});
