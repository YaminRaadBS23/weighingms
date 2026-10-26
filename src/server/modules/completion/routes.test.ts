/**
 * Consumption write-back and summary over HTTP against the real Dummy Scale and Dummy OrgaTEX —
 * stories 001–003, workbook Step 26 (STEP-26 evidence).
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  CompletionSummaryResponse,
  PendingCountResponse,
  WriteBackView,
} from '../../../shared/completion';
import type { SessionView } from '../../../shared/weighing';
import type { DummyConsumptionList } from '../../integrations/orgatex/dummy/contract';
import { buildTestApp, ManualClock } from '../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const post = (url: string, headers: Record<string, string> = {}, payload?: object) =>
  app.inject({ method: 'POST', url, headers, ...(payload ? { payload } : {}) });
const get = (url: string) => app.inject({ method: 'GET', url });
const orgatex = (action: 'offline' | 'online') =>
  app.inject({ method: 'POST', url: `/ext/orgatex/_sim/${action}` });

const CODES = ['DYE-1180', 'DYE-2204', 'DYE-4471', 'AUX-0101', 'AUX-0107'];

/** Weighs components 1..`count` of B-24187 through the API, each exactly on its target. */
async function weigh(count = 5) {
  const clock = new ManualClock();
  app = await buildTestApp({}, clock);
  await post('/api/operators/sign-in', {}, { badge: 'BDG-0417' });
  const s = (await post('/api/sessions', {}, { batchId: 'B-24187' })).json<SessionView>();
  for (let seq = 1; seq <= count; seq++) {
    const base = `/api/sessions/${s.sessionId}/components/${seq}`;
    if (seq > 1) await post(`${base}/activate`);
    await post(`${base}/identity`, {}, { code: CODES[seq - 1] });
    const view = (await get(`/api/sessions/${s.sessionId}`)).json<SessionView>();
    const c = view.components[seq - 1]!;
    await app.inject({
      method: 'POST',
      url: `/ext/scale/_sim/${c.scale!.scaleId}/weight`,
      payload: { net: c.target.value },
    });
    clock.advance(600);
    expect((await post(`${base}/confirm`)).statusCode).toBe(200);
  }
  return s.sessionId;
}

const stored = async () =>
  (await get('/ext/orgatex/batches/B-24187/consumption')).json<DummyConsumptionList>().items;
const batchStatus = async () => (await get('/ext/orgatex/batches/B-24187')).json().status;

describe('POST /api/batches/:batchId/consumption (story 001, Step 26)', () => {
  it('completed B-24187 → 200 CONFIRMED, one posting with five lines in Dummy OrgaTEX, batch WEIGHED', async () => {
    const sid = await weigh();
    const res = await post('/api/batches/B-24187/consumption');
    expect(res.statusCode).toBe(200);
    expect(res.json<WriteBackView>()).toMatchObject({
      batchId: 'B-24187',
      sessionId: sid,
      status: 'CONFIRMED',
      requested: true,
      attempts: 1,
      lines: 5,
      lastError: null,
    });
    expect(res.json<WriteBackView>().confirmedAt).toMatch(/^2\d{3}-/);
    const postings = await stored();
    expect(postings).toHaveLength(1);
    expect(postings[0]!.lines).toHaveLength(5);
    expect(postings[0]!.lines.map((l) => l.dyestuffCode)).toEqual(CODES);
    expect(postings[0]!.operatorId).toBe('OP-0417');
    expect(await batchStatus()).toBe('WEIGHED');
  });

  it('the same key again → same response, still one posting', async () => {
    await weigh();
    const first = await post('/api/batches/B-24187/consumption', { 'idempotency-key': 'KEY-A' });
    const again = await post('/api/batches/B-24187/consumption', { 'idempotency-key': 'KEY-A' });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
    expect(await stored()).toHaveLength(1);
  });

  it('a different key afterwards → 409 WRITEBACK_KEY_MISMATCH', async () => {
    await weigh();
    await post('/api/batches/B-24187/consumption', { 'idempotency-key': 'KEY-A' });
    const res = await post('/api/batches/B-24187/consumption', { 'idempotency-key': 'KEY-B' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('WRITEBACK_KEY_MISMATCH');
  });

  it('an incomplete batch → 422 BATCH_INCOMPLETE and nothing in OrgaTEX', async () => {
    await weigh(2);
    const res = await post('/api/batches/B-24187/consumption');
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: 'BATCH_INCOMPLETE',
      details: { done: 2, total: 5 },
    });
    expect(await stored()).toHaveLength(0);
    expect(await batchStatus()).toBe('WEIGHING');
  });

  it('a batch nobody weighed → 404; a bad key → 400', async () => {
    await weigh();
    expect((await post('/api/batches/B-24188/consumption')).statusCode).toBe(404);
    const bad = await post('/api/batches/B-24187/consumption', { 'idempotency-key': ' ' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('hold and retry (story 002)', () => {
  it('OrgaTEX offline → 200 PENDING, count 1; retry offline stays PENDING; online retry → CONFIRMED, still one posting', async () => {
    const sid = await weigh();
    await orgatex('offline');
    const held = await post('/api/batches/B-24187/consumption');
    expect(held.statusCode).toBe(200);
    expect(held.json<WriteBackView>()).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: { code: 'ORGATEX_UNAVAILABLE' },
    });
    expect((await get('/api/write-backs/pending-count')).json<PendingCountResponse>()).toEqual({
      count: 1,
    });

    const offlineRetry = await post('/api/batches/B-24187/write-back/retry');
    expect(offlineRetry.json<WriteBackView>()).toMatchObject({ status: 'PENDING', attempts: 2 });

    await orgatex('online');
    const done = await post('/api/batches/B-24187/write-back/retry');
    expect(done.statusCode).toBe(200);
    expect(done.json<WriteBackView>()).toMatchObject({
      status: 'CONFIRMED',
      attempts: 3,
      lastError: null,
    });
    expect(await stored()).toHaveLength(1);
    expect(await batchStatus()).toBe('WEIGHED');
    expect((await get('/api/write-backs/pending-count')).json<PendingCountResponse>()).toEqual({
      count: 0,
    });

    const audit = (await get(`/api/sessions/${sid}/audit`)).json<{ items: { type: string }[] }>()
      .items;
    expect(audit.filter((e) => e.type === 'WRITEBACK_RETRY')).toHaveLength(2);
  });

  it('GET write-back: never sent → requested false; after a send → the state; incomplete → 409', async () => {
    await weigh();
    expect((await get('/api/batches/B-24187/write-back')).json<WriteBackView>()).toMatchObject({
      status: 'PENDING',
      requested: false,
      attempts: 0,
    });
    await post('/api/batches/B-24187/consumption');
    expect((await get('/api/batches/B-24187/write-back')).json<WriteBackView>().status).toBe(
      'CONFIRMED',
    );
  });

  it('GET write-back of an incomplete batch → 409', async () => {
    await weigh(1);
    const res = await get('/api/batches/B-24187/write-back');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BATCH_INCOMPLETE');
  });

  it('retry without a write-back → 404; without a signed-in operator → 401', async () => {
    await weigh();
    expect((await post('/api/batches/B-24187/write-back/retry')).statusCode).toBe(404);
    await post('/api/operators/sign-out');
    await post('/api/batches/B-24187/consumption');
    expect((await post('/api/batches/B-24187/write-back/retry')).statusCode).toBe(401);
  });

  it('a pending batch does not block weighing or the summary', async () => {
    await weigh();
    await orgatex('offline');
    await post('/api/batches/B-24187/consumption');
    expect((await get('/api/batches/B-24187/summary')).statusCode).toBe(200);
  });

  it('pending count is 0 when nothing is completed', async () => {
    await weigh(2);
    expect((await get('/api/write-backs/pending-count')).json()).toEqual({ count: 0 });
  });
});

describe('GET /api/batches/:batchId/summary (story 003)', () => {
  it('5 of 5, all within tolerance, total, elapsed, operator, write-back state', async () => {
    const sid = await weigh();
    const res = await get('/api/batches/B-24187/summary');
    expect(res.statusCode).toBe(200);
    expect(res.json<CompletionSummaryResponse>()).toMatchObject({
      batchId: 'B-24187',
      sessionId: sid,
      componentsWeighed: 5,
      componentsTotal: 5,
      allWithinTolerance: true,
      totalDispensed: { value: '35.320', unit: 'kg' },
      operator: { operatorId: 'OP-0417', name: 'R. Karim' },
      writeBack: { status: 'PENDING', requested: false },
    });
    expect(typeof res.json<CompletionSummaryResponse>().elapsedSeconds).toBe('number');
  });

  it('an incomplete batch → 409; no session → 404', async () => {
    await weigh(3);
    const res = await get('/api/batches/B-24187/summary');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BATCH_INCOMPLETE');
    expect((await get('/api/batches/B-24188/summary')).statusCode).toBe(404);
  });
});
