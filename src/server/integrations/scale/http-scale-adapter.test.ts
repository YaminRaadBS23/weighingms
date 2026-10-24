import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fetchHttpClient, injectHttpClient, type AdapterLogger, type HttpClient } from '../http';
import { buildTestApp } from '../../test-support';
import { HttpScaleAdapter } from './http-scale-adapter';

interface Line {
  level: 'debug' | 'info' | 'warn';
  obj: Record<string, unknown>;
}
function recordingLogger(): AdapterLogger & { lines: Line[] } {
  const lines: Line[] = [];
  const rec = (level: Line['level']) => (obj: object) =>
    lines.push({ level, obj: obj as Record<string, unknown> });
  return { lines, debug: rec('debug'), info: rec('info'), warn: rec('warn') };
}

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildTestApp();
});
afterEach(async () => app.close());

function adapter(client?: HttpClient, timeoutMs = 200) {
  const logger = recordingLogger();
  return {
    logger,
    scales: new HttpScaleAdapter({
      client: client ?? injectHttpClient(app, '/ext/scale'),
      timeoutMs,
      logger,
    }),
  };
}

describe('HttpScaleAdapter', () => {
  it('maps the scale list and a single scale', async () => {
    const { scales } = adapter();
    const list = await scales.listScales();
    expect(list.map((s) => [s.scaleId, s.class, s.unit])).toEqual([
      ['scale-3kg', 'PRECISION', 'g'],
      ['scale-32kg', 'FLOOR', 'kg'],
    ]);
    expect((await scales.getScale('scale-32kg')).capacity).toEqual({ value: '32', unit: 'kg' });
  });

  it('reads the net weight with stability and time; tare returns the applied tare', async () => {
    const { scales } = adapter();
    await app.inject({
      method: 'POST',
      url: '/ext/scale/_sim/scale-3kg/container',
      payload: { weight: '214.0' },
    });
    expect(await scales.tare('scale-3kg')).toEqual({ value: '214.0', unit: 'g' });
    const reading = await scales.read('scale-3kg');
    expect(reading.net).toEqual({ value: '0.0', unit: 'g' });
    expect(typeof reading.stable).toBe('boolean');
    expect(typeof reading.at).toBe('string');
  });

  it('logs successful calls at debug only, failures at warn (IR-09)', async () => {
    const { scales, logger } = adapter();
    await scales.read('scale-3kg');
    expect(logger.lines).toEqual([
      {
        level: 'debug',
        obj: expect.objectContaining({
          system: 'scale',
          operation: 'read',
          scaleId: 'scale-3kg',
          outcome: 'ok',
        }),
      },
    ]);
    await app.inject({ method: 'POST', url: '/ext/scale/_sim/scale-3kg/disconnect' });
    await scales.read('scale-3kg').catch(() => undefined);
    expect(logger.lines.at(-1)).toMatchObject({ level: 'warn', obj: { outcome: 'unavailable' } });
  });

  it('disconnected scale → SCALE_UNAVAILABLE (503) for read and tare', async () => {
    const { scales } = adapter();
    await app.inject({ method: 'POST', url: '/ext/scale/_sim/scale-3kg/disconnect' });
    await expect(scales.read('scale-3kg')).rejects.toMatchObject({
      code: 'SCALE_UNAVAILABLE',
      httpStatus: 503,
    });
    await expect(scales.tare('scale-3kg')).rejects.toMatchObject({ code: 'SCALE_UNAVAILABLE' });
  });

  it('unknown scale → SCALE_NOT_FOUND (404)', async () => {
    const { scales } = adapter();
    await expect(scales.read('nope')).rejects.toMatchObject({
      code: 'SCALE_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('no answer within the timeout → SCALE_UNAVAILABLE', async () => {
    const hanging: HttpClient = { request: () => new Promise(() => undefined) };
    const { scales } = adapter(hanging, 50);
    await expect(scales.read('scale-3kg')).rejects.toMatchObject({ code: 'SCALE_UNAVAILABLE' });
  });

  it('connection refused → SCALE_UNAVAILABLE', async () => {
    const { scales } = adapter(fetchHttpClient('http://127.0.0.1:9/ext/scale'), 1000);
    await expect(scales.read('scale-3kg')).rejects.toMatchObject({ code: 'SCALE_UNAVAILABLE' });
  });

  it('malformed reading → SCALE_PROTOCOL_ERROR (502)', async () => {
    const garbage: HttpClient = { request: async () => ({ status: 200, body: { weird: true } }) };
    const { scales } = adapter(garbage);
    await expect(scales.read('scale-3kg')).rejects.toMatchObject({
      code: 'SCALE_PROTOCOL_ERROR',
      httpStatus: 502,
    });
  });
});

describe('HttpScaleAdapter.tare with the expected container (ADR-4)', () => {
  it('sends containerWeight; the Dummy Scale places the container and returns its tare', async () => {
    const { scales } = adapter();
    expect(
      await scales.tare('scale-3kg', { containerTare: { value: '214.0', unit: 'g' } }),
    ).toEqual({
      value: '214.0',
      unit: 'g',
    });
    expect((await scales.read('scale-3kg')).net).toEqual({ value: '0.0', unit: 'g' });
  });

  it('sends no body when no container is given', async () => {
    const seen: unknown[] = [];
    const recording: HttpClient = {
      request: async (req) => {
        seen.push(req.body);
        return { status: 200, body: { tare: { value: '0.0', unit: 'g' } } };
      },
    };
    const { scales } = adapter(recording);
    await scales.tare('scale-3kg');
    await scales.tare('scale-3kg', { containerTare: { value: '1.850', unit: 'kg' } });
    expect(seen).toEqual([undefined, { containerWeight: { value: '1.850', unit: 'kg' } }]);
  });
});
