import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-support';
import type { DummyPrintJob, DummyPrintJobList } from './contract';

let app: FastifyInstance;
afterEach(async () => app?.close());

const get = (url: string) => app.inject({ method: 'GET', url: `/ext/printer${url}` });
const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/ext/printer${url}`, ...(payload ? { payload } : {}) });

const doc = {
  documentId: 'T-1',
  lines: ['FCI DYEING — WEIGHING TICKET', 'BATCH   B-24187'],
  barcode: 'B-24187',
};

describe('Dummy Printer contract (training)', () => {
  it('READY: prints, returns PRINTED with a preview, and stores the job', async () => {
    app = await buildTestApp();
    expect((await get('/status')).json()).toEqual({ state: 'READY' });
    const res = await post('/jobs', doc);
    expect(res.statusCode).toBe(200);
    const job = res.json<DummyPrintJob>();
    expect(job).toMatchObject({
      documentId: 'T-1',
      status: 'PRINTED',
      barcode: 'B-24187',
      lines: doc.lines,
    });
    expect(job.preview).toBe('FCI DYEING — WEIGHING TICKET\nBATCH   B-24187\n[barcode: B-24187]');
    expect((await get('/jobs')).json<DummyPrintJobList>().items).toEqual([job]);
  });

  it('a document without barcode prints without the barcode line', async () => {
    app = await buildTestApp();
    const job = (
      await post('/jobs', { documentId: 'T-2', lines: ['x'], barcode: null })
    ).json<DummyPrintJob>();
    expect(job.preview).toBe('x');
  });

  it.each([
    ['OFFLINE', 'PRINTER_OFFLINE'],
    ['OUT_OF_PAPER', 'PRINTER_OUT_OF_PAPER'],
  ])('%s: print answers 503 %s with the state and stores nothing', async (state, code) => {
    app = await buildTestApp();
    await post('/_sim/state', { state });
    expect((await get('/status')).json()).toEqual({ state });
    const res = await post('/jobs', doc);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: { code, message: expect.any(String), details: { state } },
    });
    expect((await get('/jobs')).json<DummyPrintJobList>().items).toEqual([]);
  });

  it('rejects a malformed document (400) and an invalid simulated state (400)', async () => {
    app = await buildTestApp();
    expect((await post('/jobs', { documentId: 'T', lines: 'not-an-array' })).statusCode).toBe(400);
    expect((await post('/_sim/state', { state: 'JAMMED' })).statusCode).toBe(400);
  });

  it('reset: READY and no jobs', async () => {
    app = await buildTestApp();
    await post('/jobs', doc);
    await post('/_sim/state', { state: 'OFFLINE' });
    await post('/_sim/reset');
    expect((await get('/status')).json()).toEqual({ state: 'READY' });
    expect((await get('/jobs')).json<DummyPrintJobList>().items).toEqual([]);
  });

  it('production configuration: _sim endpoints are not registered (404)', async () => {
    app = await buildTestApp({ env: 'production', enableSimulation: false });
    expect((await post('/_sim/state', { state: 'OFFLINE' })).statusCode).toBe(404);
    expect((await post('/_sim/reset')).statusCode).toBe(404);
    expect((await post('/jobs', doc)).statusCode).toBe(200);
  });
});
