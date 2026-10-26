/**
 * Weighing ticket over HTTP against the real Dummy Printer, Dummy Scale and Dummy OrgaTEX —
 * stories 004–006, workbook Step 27 (STEP-27 evidence).
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { WriteBackView } from '../../../shared/completion';
import type { BatchTicketsResponse, TicketPreview, TicketView } from '../../../shared/ticket';
import type { SessionView } from '../../../shared/weighing';
import type { DummyPrintJobList } from '../../integrations/printer/dummy/contract';
import { buildTestApp, ManualClock } from '../../test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

const post = (url: string, payload?: object) =>
  app.inject({ method: 'POST', url, ...(payload ? { payload } : {}) });
const get = (url: string) => app.inject({ method: 'GET', url });
const printerState = (state: 'READY' | 'OFFLINE' | 'OUT_OF_PAPER') =>
  post('/ext/printer/_sim/state', { state });
const jobs = async () => (await get('/ext/printer/jobs')).json<DummyPrintJobList>().items;
const createTicket = (batchId = 'B-24187') => post('/api/tickets', { batchId });

const CODES = ['DYE-1180', 'DYE-2204', 'DYE-4471', 'AUX-0101', 'AUX-0107'];

/** Weighs components 1..`count` of B-24187 through the API, each exactly on its target. */
async function weigh(count = 5) {
  const clock = new ManualClock();
  app = await buildTestApp({}, clock);
  await post('/api/operators/sign-in', { badge: 'BDG-0417' });
  const s = (await post('/api/sessions', { batchId: 'B-24187' })).json<SessionView>();
  for (let seq = 1; seq <= count; seq++) {
    const base = `/api/sessions/${s.sessionId}/components/${seq}`;
    if (seq > 1) await post(`${base}/activate`);
    await post(`${base}/identity`, { code: CODES[seq - 1] });
    const view = (await get(`/api/sessions/${s.sessionId}`)).json<SessionView>();
    const c = view.components[seq - 1]!;
    await post(`/ext/scale/_sim/${c.scale!.scaleId}/weight`, { net: c.target.value });
    clock.advance(600);
    expect((await post(`${base}/confirm`)).statusCode).toBe(200);
  }
  return s.sessionId;
}

describe('POST /api/tickets (story 004, Step 27)', () => {
  it('completed B-24187 → 201 PRINTED with the stored ticket and a preview', async () => {
    const sid = await weigh();
    const res = await createTicket();
    expect(res.statusCode).toBe(201);
    const t = res.json<TicketView>();
    expect(t).toMatchObject({
      batchId: 'B-24187',
      sessionId: sid,
      isReprint: false,
      reprintOf: null,
      printStatus: 'PRINTED',
      printAttempts: 1,
      lastError: null,
    });
    expect(t.jobId).toBeTruthy();
    expect(t.content).toMatchObject({
      title: 'FCI DYEING — WEIGHING TICKET',
      batch: 'B-24187',
      order: 'SO-9931',
      machine: 'JET-04',
      shade: 'Teal 4C',
      operator: 'R. Karim (OP-0417)',
      verdict: ['ALL WITHIN TOLERANCE'],
      barcodeValue: 'B-24187',
      reprint: false,
    });
    expect(t.content.rows.map((r) => [r.shortName, r.target, r.actual, r.unit])).toEqual([
      ['Blue RSPL', '1240.0', '1240.0', 'g'],
      ['Red RB', '386.0', '386.0', 'g'],
      ['Yellow RGB', '94.0', '94.0', 'g'],
      ['Na2SO4', '24.000', '24.000', 'kg'],
      ['Soda Ash', '9.600', '9.600', 'kg'],
    ]);
    expect(t.preview.barcode).toMatchObject({ value: 'B-24187', symbology: 'CODE128' });
    expect(t.preview.barcode.svg).toMatch(/^<svg .*<\/svg>$/);
    expect(t.preview.lines).toEqual(t.content.lines);
  });

  it('the Dummy Printer holds one job with exactly the stored lines and the barcode value', async () => {
    await weigh();
    const t = (await createTicket()).json<TicketView>();
    const printed = await jobs();
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({
      documentId: t.ticketId,
      jobId: t.jobId,
      status: 'PRINTED',
      lines: t.content.lines,
      barcode: 'B-24187',
    });
  });

  it('asking again → 200 with the same ticket, nothing more printed', async () => {
    await weigh();
    const first = (await createTicket()).json<TicketView>();
    const again = await createTicket();
    expect(again.statusCode).toBe(200);
    expect(again.json<TicketView>().ticketId).toBe(first.ticketId);
    expect(await jobs()).toHaveLength(1);
  });

  it('GET ticket and GET preview show the same content', async () => {
    await weigh();
    const t = (await createTicket()).json<TicketView>();
    const full = await get(`/api/tickets/${t.ticketId}`);
    expect(full.statusCode).toBe(200);
    expect(full.json<TicketView>()).toEqual(t);
    const preview = await get(`/api/tickets/${t.ticketId}/preview`);
    expect(preview.statusCode).toBe(200);
    expect(preview.json<TicketPreview>()).toEqual(t.preview);
  });

  it('an unknown ticket → 404 TICKET_NOT_FOUND on every ticket endpoint', async () => {
    await weigh();
    for (const [method, url] of [
      ['GET', '/api/tickets/T-404'],
      ['GET', '/api/tickets/T-404/preview'],
      ['POST', '/api/tickets/T-404/print'],
      ['POST', '/api/tickets/T-404/reprint'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().error.code).toBe('TICKET_NOT_FOUND');
    }
  });

  it('an incomplete batch → 422 BATCH_INCOMPLETE; a batch nobody weighed → 404; a bad body → 400', async () => {
    await weigh(2);
    const incomplete = await createTicket();
    expect(incomplete.statusCode).toBe(422);
    expect(incomplete.json().error).toMatchObject({
      code: 'BATCH_INCOMPLETE',
      details: { done: 2, total: 5 },
    });
    expect(await jobs()).toHaveLength(0);
    expect((await createTicket('B-24188')).statusCode).toBe(404);
    expect((await post('/api/tickets', {})).statusCode).toBe(400);
    expect((await post('/api/tickets', { batchId: '  ' })).statusCode).toBe(400);
    expect((await post('/api/tickets')).statusCode).toBe(400);
  });

  it('works with OrgaTEX offline and the write-back pending (independent)', async () => {
    await weigh();
    await post('/ext/orgatex/_sim/offline');
    const res = await createTicket();
    expect(res.statusCode).toBe(201);
    expect(res.json<TicketView>().printStatus).toBe('PRINTED');
    expect((await get('/api/batches/B-24187/write-back')).json<WriteBackView>()).toMatchObject({
      status: 'PENDING',
      requested: false,
    });
  });
});

describe('printer unavailable (story 005)', () => {
  it('OFFLINE → 503 with the state and the ticket id; ticket FAILED; preview still works; READY → retry → PRINTED, not REPRINT', async () => {
    const sid = await weigh();
    await printerState('OFFLINE');
    const res = await createTicket();
    expect(res.statusCode).toBe(503);
    const error = res.json().error;
    expect(error).toMatchObject({
      code: 'PRINTER_UNAVAILABLE',
      details: { state: 'OFFLINE', printStatus: 'FAILED' },
    });
    const id = error.details.ticketId as string;

    const failed = (await get(`/api/tickets/${id}`)).json<TicketView>();
    expect(failed).toMatchObject({
      printStatus: 'FAILED',
      printAttempts: 1,
      jobId: null,
      lastError: { code: 'PRINTER_UNAVAILABLE', state: 'OFFLINE' },
    });
    const preview = await get(`/api/tickets/${id}/preview`);
    expect(preview.statusCode).toBe(200);
    expect(preview.json<TicketPreview>().lines).toEqual(failed.content.lines);
    expect(await jobs()).toHaveLength(0);

    // the batch's session and the write-back are untouched
    expect((await get(`/api/sessions/${sid}`)).json<SessionView>().status).toBe('COMPLETED');
    expect((await get('/api/batches/B-24187/write-back')).json<WriteBackView>().requested).toBe(
      false,
    );

    await printerState('READY');
    const retry = await post(`/api/tickets/${id}/print`);
    expect(retry.statusCode).toBe(200);
    expect(retry.json<TicketView>()).toMatchObject({
      ticketId: id,
      printStatus: 'PRINTED',
      printAttempts: 2,
      isReprint: false,
      lastError: null,
    });
    expect((await jobs()).map((j) => j.lines)).toEqual([failed.content.lines]);
    expect(retry.json<TicketView>().content.lines).not.toContain('*** REPRINT ***');
  });

  it('OUT_OF_PAPER is reported as that state; a retry that fails again is counted', async () => {
    await weigh();
    await printerState('OUT_OF_PAPER');
    const res = await createTicket();
    expect(res.statusCode).toBe(503);
    expect(res.json().error.details.state).toBe('OUT_OF_PAPER');
    const id = res.json().error.details.ticketId as string;
    const again = await post(`/api/tickets/${id}/print`);
    expect(again.statusCode).toBe(503);
    expect((await get(`/api/tickets/${id}`)).json<TicketView>().printAttempts).toBe(2);
  });

  it('printing a PRINTED ticket → 200 unchanged, nothing more on paper', async () => {
    await weigh();
    const t = (await createTicket()).json<TicketView>();
    const again = await post(`/api/tickets/${t.ticketId}/print`);
    expect(again.statusCode).toBe(200);
    expect(again.json<TicketView>()).toEqual(t);
    expect(await jobs()).toHaveLength(1);
  });
});

describe('reprint (story 006)', () => {
  it('a PRINTED ticket → 201 new ticket marked REPRINT with the same content; audited; printed', async () => {
    const sid = await weigh();
    const original = (await createTicket()).json<TicketView>();
    const res = await post(`/api/tickets/${original.ticketId}/reprint`);
    expect(res.statusCode).toBe(201);
    const copy = res.json<TicketView>();
    expect(copy).toMatchObject({
      isReprint: true,
      reprintOf: original.ticketId,
      printStatus: 'PRINTED',
    });
    expect(copy.ticketId).not.toBe(original.ticketId);
    expect(copy.content.lines[1]).toBe('*** REPRINT ***');
    expect(copy.content.lines.filter((l) => l !== '*** REPRINT ***')).toEqual(
      original.content.lines,
    );
    const printed = await jobs();
    expect(printed.map((j) => j.documentId)).toEqual([original.ticketId, copy.ticketId]);
    expect(printed[1]!.lines).toEqual(copy.content.lines);

    const events = app.weighing.auditLog.listForSession(sid).filter((e) => e.type === 'REPRINT');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: 'OP-0417',
      detail: { batchId: 'B-24187', originalTicketId: original.ticketId, ticketId: copy.ticketId },
    });
  });

  it('nobody signed in → 401; a ticket that never printed → 409 TICKET_NOT_PRINTED', async () => {
    const sid = await weigh();
    await printerState('OFFLINE');
    const failedId = (await createTicket()).json().error.details.ticketId as string;
    await printerState('READY');
    const notPrinted = await post(`/api/tickets/${failedId}/reprint`);
    expect(notPrinted.statusCode).toBe(409);
    expect(notPrinted.json().error).toMatchObject({
      code: 'TICKET_NOT_PRINTED',
      details: { printStatus: 'FAILED' },
    });

    await post(`/api/tickets/${failedId}/print`);
    await post('/api/operators/sign-out');
    const unsigned = await post(`/api/tickets/${failedId}/reprint`);
    expect(unsigned.statusCode).toBe(401);
    expect(unsigned.json().error.code).toBe('NOT_SIGNED_IN');
    expect(
      app.weighing.auditLog.listForSession(sid).filter((e) => e.type === 'REPRINT'),
    ).toHaveLength(0);
    expect(
      (await get('/api/batches/B-24187/tickets')).json<BatchTicketsResponse>().tickets,
    ).toHaveLength(1);
  });

  it('with the printer down the reprint is stored and audited, FAILED, and a retry keeps it a REPRINT', async () => {
    const sid = await weigh();
    const original = (await createTicket()).json<TicketView>();
    await printerState('OFFLINE');
    const res = await post(`/api/tickets/${original.ticketId}/reprint`);
    expect(res.statusCode).toBe(503);
    const copyId = res.json().error.details.ticketId as string;
    expect(copyId).not.toBe(original.ticketId);
    await printerState('READY');
    const retried = (await post(`/api/tickets/${copyId}/print`)).json<TicketView>();
    expect(retried).toMatchObject({ isReprint: true, printStatus: 'PRINTED', printAttempts: 2 });
    expect(
      app.weighing.auditLog.listForSession(sid).filter((e) => e.type === 'REPRINT'),
    ).toHaveLength(1);
  });
});

describe('GET /api/batches/:batchId/tickets', () => {
  it('lists the original first, then the reprints; empty before any ticket; unknown batch → 404', async () => {
    await weigh();
    expect(
      (await get('/api/batches/B-24187/tickets')).json<BatchTicketsResponse>().tickets,
    ).toEqual([]);
    const original = (await createTicket()).json<TicketView>();
    const copy = (await post(`/api/tickets/${original.ticketId}/reprint`)).json<TicketView>();
    const list = (await get('/api/batches/b-24187/tickets')).json<BatchTicketsResponse>().tickets;
    expect(list.map((t) => [t.ticketId, t.isReprint])).toEqual([
      [original.ticketId, false],
      [copy.ticketId, true],
    ]);
    expect((await get('/api/batches/B-24188/tickets')).statusCode).toBe(404);
  });
});
