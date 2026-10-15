import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, ManualClock } from '../../../test-support';
import type { DummyReading, DummyScaleList } from './contract';

let app: FastifyInstance;
afterEach(async () => app?.close());

const get = (url: string) => app.inject({ method: 'GET', url: `/ext/scale${url}` });
const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/ext/scale${url}`, ...(payload ? { payload } : {}) });

describe('Dummy Scale contract (training)', () => {
  it('GET /scales lists both seeded scales', async () => {
    app = await buildTestApp();
    const res = await get('/scales');
    expect(res.statusCode).toBe(200);
    expect(res.json<DummyScaleList>().items).toEqual([
      {
        scaleId: 'scale-3kg',
        class: 'PRECISION',
        capacity: { value: '3', unit: 'kg' },
        unit: 'g',
        resolution: { value: '0.1', unit: 'g' },
        calibrationDueAt: '2027-03-31T00:00:00Z',
        connected: true,
      },
      {
        scaleId: 'scale-32kg',
        class: 'FLOOR',
        capacity: { value: '32', unit: 'kg' },
        unit: 'kg',
        resolution: { value: '0.001', unit: 'kg' },
        calibrationDueAt: '2027-03-31T00:00:00Z',
        connected: true,
      },
    ]);
  });

  it('GET /scales/:id, /reading and POST /tare work; unknown scale → 404 SCALE_NOT_FOUND', async () => {
    app = await buildTestApp();
    expect((await get('/scales/scale-32kg')).json().class).toBe('FLOOR');
    await post('/_sim/scale-3kg/container', { weight: '214.0' });
    expect((await post('/scales/scale-3kg/tare')).json()).toEqual({
      tare: { value: '214.0', unit: 'g' },
    });
    expect((await get('/scales/scale-3kg/reading')).json<DummyReading>().net).toEqual({
      value: '0.0',
      unit: 'g',
    });
    for (const url of ['/scales/nope', '/scales/nope/reading']) {
      const res = await get(url);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('SCALE_NOT_FOUND');
    }
    expect((await post('/scales/nope/tare')).statusCode).toBe(404);
  });

  it('disconnected scale: reading and tare → 503 SCALE_OFFLINE, listing shows connected:false', async () => {
    app = await buildTestApp();
    await post('/_sim/scale-3kg/disconnect');
    expect((await get('/scales/scale-3kg/reading')).statusCode).toBe(503);
    expect((await post('/scales/scale-3kg/tare')).json().error.code).toBe('SCALE_OFFLINE');
    expect((await get('/scales')).json<DummyScaleList>().items[0]?.connected).toBe(false);
    expect((await get('/scales/scale-32kg/reading')).statusCode).toBe(200);
  });
});

describe('Dummy Scale simulation controls (training only)', () => {
  it('weight sets an exact net value (string in scale unit or { value, unit })', async () => {
    app = await buildTestApp();
    await post('/_sim/scale-3kg/weight', { net: '93.4' });
    expect((await get('/scales/scale-3kg/reading')).json().net).toEqual({
      value: '93.4',
      unit: 'g',
    });
    await post('/_sim/scale-32kg/weight', { net: { value: '120', unit: 'g' } });
    expect((await get('/scales/scale-32kg/reading')).json().net).toEqual({
      value: '0.120',
      unit: 'kg',
    });
  });

  it('dispense eases to the landing and becomes stable (controllable clock)', async () => {
    const clock = new ManualClock();
    app = await buildTestApp({}, clock);
    await post('/_sim/scale-3kg/dispense', { landing: '94.2' });
    clock.advance(30);
    const early = (await get('/scales/scale-3kg/reading')).json<DummyReading>();
    expect(Number(early.net.value)).toBeGreaterThan(0);
    expect(early.stable).toBe(false);
    clock.advance(10_000);
    const done = (await get('/scales/scale-3kg/reading')).json<DummyReading>();
    expect(done).toMatchObject({ net: { value: '94.2', unit: 'g' }, stable: true });
    expect((await get('/_sim/state')).json().scales[0].dispensing).toBe(false);
  });

  it('overshoot landing 96.4 g ends over tolerance', async () => {
    const clock = new ManualClock();
    app = await buildTestApp({}, clock);
    await post('/_sim/scale-3kg/dispense', { landing: '96.4' });
    clock.advance(10_000);
    expect((await get('/scales/scale-3kg/reading')).json().net.value).toBe('96.4');
  });

  it('container puts the container weight into the gross reading', async () => {
    app = await buildTestApp();
    await post('/_sim/scale-32kg/container', { weight: '1.850' });
    expect((await get('/scales/scale-32kg/reading')).json().gross).toEqual({
      value: '1.850',
      unit: 'kg',
    });
  });

  it('calibration expired/valid changes the due date', async () => {
    app = await buildTestApp();
    await post('/_sim/scale-3kg/calibration', { expired: true });
    const due = (await get('/scales/scale-3kg')).json().calibrationDueAt as string;
    expect(Date.parse(due)).toBeLessThan(Date.now());
    await post('/_sim/scale-3kg/calibration', { expired: false });
    expect((await get('/scales/scale-3kg')).json().calibrationDueAt).toBe('2027-03-31T00:00:00Z');
  });

  it('disconnect/reconnect and reset', async () => {
    app = await buildTestApp();
    await post('/_sim/scale-3kg/weight', { net: '50.0' });
    await post('/_sim/scale-3kg/disconnect');
    expect((await get('/scales/scale-3kg/reading')).statusCode).toBe(503);
    await post('/_sim/scale-3kg/reconnect');
    expect((await get('/scales/scale-3kg/reading')).json().net.value).toBe('50.0');
    await post('/_sim/reset');
    expect((await get('/scales/scale-3kg/reading')).json().net.value).toBe('0.0');
  });

  it.each([
    ['/_sim/scale-3kg/weight', { net: 93.4 }],
    ['/_sim/scale-3kg/weight', { net: 'abc' }],
    ['/_sim/scale-3kg/dispense', {}],
    ['/_sim/scale-3kg/calibration', { expired: 'yes' }],
  ])('rejects invalid input to %s with 400', async (url, body) => {
    app = await buildTestApp();
    expect((await post(url, body)).statusCode).toBe(400);
  });

  it('unknown scale in a control → 404', async () => {
    app = await buildTestApp();
    expect((await post('/_sim/nope/weight', { net: '1.0' })).statusCode).toBe(404);
  });

  it('production configuration: _sim endpoints are not registered (404)', async () => {
    app = await buildTestApp({ env: 'production', enableSimulation: false });
    for (const url of ['/_sim/scale-3kg/weight', '/_sim/scale-3kg/disconnect', '/_sim/reset']) {
      expect((await post(url, { net: '1.0' })).statusCode).toBe(404);
    }
    expect((await get('/_sim/state')).statusCode).toBe(404);
    expect((await get('/scales')).statusCode).toBe(200);
  });
});
