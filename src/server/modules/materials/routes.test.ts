import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ContainerListResponse, ContainerView } from '../../../shared/materials';
import type { RecipeResponse } from '../../../shared/batches';
import { buildTestApp } from '../../test-support';

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildTestApp();
});
afterEach(async () => app.close());

const validateLot = (dyestuffCode?: unknown, lotId?: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/materials/lots/validate',
    payload: { dyestuffCode, lotId },
  });
const validateContainer = (code?: unknown) =>
  app.inject({ method: 'POST', url: '/api/containers/validate', payload: { code } });

describe('POST /api/materials/lots/validate', () => {
  it('accepts 2026-0387 for DYE-4471', async () => {
    const res = await validateLot('DYE-4471', '2026-0387');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ lotId: '2026-0387', dyestuffCode: 'DYE-4471' });
  });
  it('accepts the training-only lot 2026-0402 for DYE-4471', async () => {
    expect((await validateLot('DYE-4471', '2026-0402')).statusCode).toBe(200);
  });
  it('refuses Blue’s lot 2026-0341 for DYE-4471 with 422 LOT_MISMATCH', async () => {
    const res = await validateLot('DYE-4471', '2026-0341');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('LOT_MISMATCH');
  });
  it('answers 404 LOT_NOT_FOUND for an unknown lot', async () => {
    const res = await validateLot('DYE-4471', '9999-9999');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('LOT_NOT_FOUND');
  });
  it('trims the lot text', async () => {
    expect((await validateLot('DYE-4471', ' 2026-0387 ')).statusCode).toBe(200);
  });
  it.each([
    [undefined, '2026-0387'],
    ['DYE-4471', undefined],
    ['DYE-4471', '   '],
    [42, '2026-0387'],
  ])('answers 400 VALIDATION_ERROR for missing or empty fields (%s, %s)', async (d, l) => {
    const res = await validateLot(d, l);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
  it('answers 503 ORGATEX_UNAVAILABLE for a scanned lot while OrgaTEX is offline', async () => {
    await app.inject({ method: 'POST', url: '/ext/orgatex/_sim/offline' });
    const res = await validateLot('DYE-4471', '2026-0387');
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ORGATEX_UNAVAILABLE');
  });
});

describe('GET /api/containers', () => {
  it('lists the six containers, with decimal-text tares and default dyestuffs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(200);
    const items = res.json<ContainerListResponse>().items;
    expect(items.map((c) => c.containerId)).toEqual([
      'C-09',
      'C-11',
      'C-12',
      'C-13',
      'D-03',
      'D-05',
    ]);
    expect(items.find((c) => c.containerId === 'D-03')).toEqual({
      containerId: 'D-03',
      type: 'DRUM',
      tare: { value: '1.850', unit: 'kg' },
      inService: true,
      defaultFor: 'AUX-0101',
    });
  });
  it('still answers while OrgaTEX is offline (containers are WeighingMS data)', async () => {
    await app.inject({ method: 'POST', url: '/ext/orgatex/_sim/offline' });
    expect((await app.inject({ method: 'GET', url: '/api/containers' })).statusCode).toBe(200);
  });
  it('every recipe component of B-24187 has the prototype’s default container', async () => {
    const recipe = (
      await app.inject({ method: 'GET', url: '/api/batches/B-24187/recipe' })
    ).json<RecipeResponse>();
    const containers = (
      await app.inject({ method: 'GET', url: '/api/containers' })
    ).json<ContainerListResponse>().items;
    const byName = Object.fromEntries(
      recipe.components.map((c) => [
        c.dyestuff.name,
        containers.find((k) => k.defaultFor === c.dyestuff.code)?.containerId,
      ]),
    );
    expect(Object.values(byName)).toHaveLength(5);
    const defaultsByCode = Object.fromEntries(
      recipe.components.map((c) => [
        c.dyestuff.code,
        containers.find((k) => k.defaultFor === c.dyestuff.code),
      ]),
    );
    expect(Object.entries(defaultsByCode).map(([code, k]) => [code, k?.containerId])).toEqual([
      ['DYE-1180', 'C-09'],
      ['DYE-2204', 'C-11'],
      ['DYE-4471', 'C-12'],
      ['AUX-0101', 'D-03'],
      ['AUX-0107', 'D-05'],
    ]);
    expect(Object.keys(byName).join(' ')).toMatch(/Blue.*Red.*Yellow.*Sodium Sulphate.*Soda Ash/);
  });
});

describe('POST /api/containers/validate', () => {
  it('accepts a known container and returns its tare', async () => {
    const res = await validateContainer('C-12');
    expect(res.statusCode).toBe(200);
    expect(res.json<ContainerView>()).toMatchObject({
      containerId: 'C-12',
      tare: { value: '214.0', unit: 'g' },
    });
  });
  it('accepts lower-case and padded input', async () => {
    expect((await validateContainer(' c-12 ')).json<ContainerView>().containerId).toBe('C-12');
  });
  it('answers 404 CONTAINER_UNKNOWN for C-99', async () => {
    const res = await validateContainer('C-99');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CONTAINER_UNKNOWN');
  });
  it('answers 422 CONTAINER_OUT_OF_SERVICE for C-13', async () => {
    const res = await validateContainer('C-13');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('CONTAINER_OUT_OF_SERVICE');
  });
  it.each([undefined, '', '  ', 7])('answers 400 for code %s', async (code) => {
    expect((await validateContainer(code)).statusCode).toBe(400);
  });
});
