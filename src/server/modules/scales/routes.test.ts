import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  ScaleListResponse,
  ScaleStatusResponse,
  WeightResponse,
} from '../../../shared/scales';
import { buildTestApp, ManualClock } from '../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const api = (method: 'GET' | 'POST', url: string) => app.inject({ method, url: `/api${url}` });
const sim = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/ext/scale/_sim${url}`, ...(payload ? { payload } : {}) });

describe('/api/scales facade', () => {
  it('GET /api/scales lists scale-3kg (PRECISION, 3 kg) and scale-32kg (FLOOR, 32 kg), VALID and READY', async () => {
    app = await buildTestApp();
    const res = await api('GET', '/scales');
    expect(res.statusCode).toBe(200);
    const items = res.json<ScaleListResponse>().items;
    expect(
      items.map((s) => [
        s.scaleId,
        s.class,
        `${s.capacity.value} ${s.capacity.unit}`,
        s.resolution.value,
        s.calibration,
        s.state,
      ]),
    ).toEqual([
      ['scale-3kg', 'PRECISION', '3 kg', '0.1', 'VALID', 'READY'],
      ['scale-32kg', 'FLOOR', '32 kg', '0.001', 'VALID', 'READY'],
    ]);
    for (const s of items) expect(Date.parse(s.calibrationDueAt)).toBeGreaterThan(Date.now());
  });

  it('status: READY → OFFLINE (disconnected) → CAL_EXPIRED (reconnected, calibration expired)', async () => {
    app = await buildTestApp();
    const status = async () =>
      (await api('GET', '/scales/scale-3kg/status')).json<ScaleStatusResponse>();
    expect(await status()).toEqual({
      scaleId: 'scale-3kg',
      connected: true,
      calibration: 'VALID',
      state: 'READY',
    });
    await sim('/scale-3kg/disconnect');
    expect(await status()).toMatchObject({ connected: false, state: 'OFFLINE' });
    await sim('/scale-3kg/reconnect');
    await sim('/scale-3kg/calibration', { expired: true });
    expect(await status()).toMatchObject({
      connected: true,
      calibration: 'EXPIRED',
      state: 'CAL_EXPIRED',
    });
  });

  it('weight: container 214.0 g + tare → { "0.0" g, connected: true }', async () => {
    app = await buildTestApp();
    await sim('/scale-3kg/container', { weight: '214.0' });
    expect((await api('POST', '/scales/scale-3kg/tare')).json()).toEqual({
      tare: { value: '214.0', unit: 'g' },
    });
    const w = (await api('GET', '/scales/scale-3kg/weight')).json<WeightResponse>();
    expect(w).toMatchObject({ weight: { value: '0.0', unit: 'g' }, connected: true });
    expect(typeof w.stable).toBe('boolean');
    expect(typeof w.at).toBe('string');
  });

  it('a second tare replaces the first', async () => {
    app = await buildTestApp();
    await sim('/scale-3kg/container', { weight: '214.0' });
    await api('POST', '/scales/scale-3kg/tare');
    await sim('/scale-3kg/weight', { net: '10.0' });
    expect((await api('POST', '/scales/scale-3kg/tare')).json().tare.value).toBe('224.0');
    expect((await api('GET', '/scales/scale-3kg/weight')).json().weight.value).toBe('0.0');
  });

  it('stable only after 500 ms unchanged (controllable clock)', async () => {
    const clock = new ManualClock();
    app = await buildTestApp({}, clock);
    await sim('/scale-3kg/weight', { net: '94.0' });
    expect((await api('GET', '/scales/scale-3kg/weight')).json().stable).toBe(false);
    clock.advance(499);
    expect((await api('GET', '/scales/scale-3kg/weight')).json().stable).toBe(false);
    clock.advance(1);
    expect((await api('GET', '/scales/scale-3kg/weight')).json().stable).toBe(true);
  });

  it('floor scale reads kg with 3 decimals', async () => {
    app = await buildTestApp();
    await sim('/scale-32kg/weight', { net: '24' });
    expect((await api('GET', '/scales/scale-32kg/weight')).json().weight).toEqual({
      value: '24.000',
      unit: 'kg',
    });
  });

  it('disconnected scale → 503 SCALE_UNAVAILABLE on weight and tare; the other scale is unaffected; reconnect resumes', async () => {
    app = await buildTestApp();
    await sim('/scale-3kg/weight', { net: '50.0' });
    await sim('/scale-3kg/disconnect');
    for (const res of [
      await api('GET', '/scales/scale-3kg/weight'),
      await api('POST', '/scales/scale-3kg/tare'),
    ]) {
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('SCALE_UNAVAILABLE');
    }
    expect((await api('GET', '/scales/scale-32kg/weight')).statusCode).toBe(200);
    await sim('/scale-3kg/reconnect');
    expect((await api('GET', '/scales/scale-3kg/weight')).json().weight.value).toBe('50.0');
  });

  it('unknown scale → 404 SCALE_NOT_FOUND on every endpoint', async () => {
    app = await buildTestApp();
    for (const [m, url] of [
      ['GET', '/scales/x/weight'],
      ['GET', '/scales/x/status'],
      ['POST', '/scales/x/tare'],
    ] as const) {
      const res = await api(m, url);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('SCALE_NOT_FOUND');
    }
  });

  it('20 consecutive reads at 100 ms intervals all succeed within the interval', async () => {
    app = await buildTestApp();
    const durations: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now();
      const res = await api('GET', '/scales/scale-3kg/weight');
      durations.push(performance.now() - started);
      expect(res.statusCode).toBe(200);
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(Math.max(...durations)).toBeLessThan(100);
  });
});
