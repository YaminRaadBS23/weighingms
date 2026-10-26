import { afterEach, describe, expect, it } from 'vitest';
import { DeviceProtocolError, PrinterUnavailableError } from '../../../errors';
import type { OrgatexPort } from '../../../integrations/orgatex/orgatex-port';
import type {
  PrintDocument,
  PrinterPort,
  PrintResult,
} from '../../../integrations/printer/printer-port';
import {
  closeDb,
  confirmOnTarget,
  g,
  started,
  unlock,
  type T,
} from '../../weighing/application/confirmation-test-support';
import { DrizzleTicketRepository } from '../infrastructure/drizzle-ticket-repository';
import { createCompletionModule } from '../module';

afterEach(closeDb);

/** Records what it was asked to print and what the ticket looked like at that moment. */
class FakePrinter implements PrinterPort {
  fail: Error | null = null;
  prints: PrintDocument[] = [];
  statusAtPrint: (string | undefined)[] = [];
  constructor(private readonly tickets: DrizzleTicketRepository) {}

  async print(doc: PrintDocument): Promise<PrintResult> {
    this.prints.push(doc);
    this.statusAtPrint.push(this.tickets.findById(doc.documentId)?.printStatus);
    if (this.fail) throw this.fail;
    return {
      jobId: `J-${this.prints.length}`,
      documentId: doc.documentId,
      printedAt: '2026-10-25T07:00:01.000Z',
      preview: '',
    };
  }
  async getStatus(): Promise<'READY'> {
    return 'READY';
  }
  async listJobs(): Promise<PrintResult[]> {
    return [];
  }
}

/** Any call is a failure: the ticket path must never need OrgaTEX (TD-1, ADR-11). */
const noOrgatex = new Proxy(
  {},
  {
    get(_target, name) {
      throw new Error(`OrgaTEX must not be called (${String(name)})`);
    },
  },
) as OrgatexPort;

async function completed(overrideThird = false) {
  const t: T & { sid: string } = await started();
  for (const seq of [1, 2]) await confirmOnTarget(t, seq);
  if (overrideThird) {
    await unlock(t, 3);
    t.scales.net = g('96.4');
    await t.w.override.override(t.sid, 3, {
      supervisorBadge: 'BDG-0901',
      pin: '2580',
      reason: 'Customer approved',
    });
  } else {
    await confirmOnTarget(t, 3);
  }
  for (const seq of [4, 5]) await confirmOnTarget(t, seq);
  const tickets = new DrizzleTicketRepository(t.db);
  const printer = new FakePrinter(tickets);
  const c = createCompletionModule({ db: t.db, orgatex: noOrgatex, printer, weighing: t.w });
  return { t, printer, repo: tickets, ...c };
}

const reprints = (t: T & { sid: string }) =>
  t.w.auditLog.listForSession(t.sid).filter((e) => e.type === 'REPRINT');

describe('generate (story 004)', () => {
  it('stores the ticket before printing it, then prints exactly the stored text and the batch id', async () => {
    const { printer, tickets, repo } = await completed();
    const { ticket, created } = await tickets.generate('B-24187');
    expect(created).toBe(true);
    expect(printer.statusAtPrint).toEqual(['NOT_SENT']);
    expect(printer.prints).toHaveLength(1);
    expect(printer.prints[0]).toEqual({
      documentId: ticket.ticketId,
      lines: ticket.content.lines,
      barcode: 'B-24187',
    });
    expect(repo.findById(ticket.ticketId)?.snapshot()).toMatchObject({
      printStatus: 'PRINTED',
      printAttempts: 1,
      jobId: 'J-1',
      isReprint: false,
      createdBy: 'OP-0417',
    });
  });

  it('composes the ticket from the records (short names from the recipe snapshot; the text cuts long ones)', async () => {
    const { tickets } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    expect(ticket.content).toMatchObject({
      batch: 'B-24187',
      shade: 'Teal 4C',
      date: '2026-10-25 07:00',
      operator: 'R. Karim (OP-0417)',
      verdict: ['ALL WITHIN TOLERANCE'],
      barcodeValue: 'B-24187',
    });
    expect(ticket.content.lines).toContain('Sodium Su~  24.000  24.000 kg ');
    expect(ticket.content.rows.map((r) => [r.shortName, r.target, r.actual, r.unit])).toEqual([
      ['Blue', '1240.0', '1240.0', 'g'],
      ['Red', '386.0', '386.0', 'g'],
      ['Yellow', '94.0', '94.0', 'g'],
      ['Sodium Sulphate', '24.000', '24.000', 'kg'],
      ['Soda Ash', '9.600', '9.600', 'kg'],
    ]);
  });

  it('lists an override as an exception instead of "ALL WITHIN TOLERANCE"', async () => {
    const { tickets } = await completed(true);
    const { ticket } = await tickets.generate('B-24187');
    expect(ticket.content.verdict).toEqual(['EXCEPTION Yellow OVERRIDDEN']);
    expect(ticket.content.rows[2]!.actual).toBe('96.4');
  });

  it('asking again returns the stored original and prints nothing (idempotent)', async () => {
    const { printer, tickets } = await completed();
    const first = await tickets.generate('B-24187');
    const again = await tickets.generate(' b-24187 ');
    expect(again.created).toBe(false);
    expect(again.ticket.ticketId).toBe(first.ticket.ticketId);
    expect(printer.prints).toHaveLength(1);
  });

  it('presses Print three times at once → one ticket, one print', async () => {
    const { printer, tickets } = await completed();
    const results = await Promise.all([
      tickets.generate('B-24187'),
      tickets.generate('B-24187'),
      tickets.generate('B-24187'),
    ]);
    expect(new Set(results.map((r) => r.ticket.ticketId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(printer.prints).toHaveLength(1);
    expect(tickets.forBatch('B-24187')).toHaveLength(1);
  });

  it('an incomplete batch → 422 BATCH_INCOMPLETE; nothing stored, nothing printed', async () => {
    const t = await started();
    await confirmOnTarget(t, 1);
    const repo = new DrizzleTicketRepository(t.db);
    const printer = new FakePrinter(repo);
    const { tickets } = createCompletionModule({
      db: t.db,
      orgatex: noOrgatex,
      printer,
      weighing: t.w,
    });
    await expect(tickets.generate('B-24187')).rejects.toMatchObject({
      code: 'BATCH_INCOMPLETE',
      httpStatus: 422,
      details: { done: 1, total: 5 },
    });
    expect(repo.listByBatch('B-24187')).toEqual([]);
    expect(printer.prints).toEqual([]);
  });

  it('a batch nobody weighed → 404 SESSION_NOT_FOUND', async () => {
    const { tickets } = await completed();
    await expect(tickets.generate('B-99999')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('works while the write-back is pending and OrgaTEX is unreachable (independence)', async () => {
    const { tickets, writeBacks } = await completed();
    const { ticket } = await tickets.generate('B-24187'); // noOrgatex throws on any call
    expect(ticket.isPrinted).toBe(true);
    expect(writeBacks.pendingCount()).toBe(1);
    expect(writeBacks.status('B-24187')).toMatchObject({ requested: false, status: 'PENDING' });
  });

  it('the preview shows the printed lines and a barcode of the same value', async () => {
    const { printer, tickets } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    const preview = tickets.preview(ticket);
    expect(preview.lines).toEqual(printer.prints[0]!.lines);
    expect(preview.barcode).toMatchObject({ value: 'B-24187', symbology: 'CODE128' });
    expect(preview.barcode.svg).toMatch(/^<svg /);
    expect(tickets.view(ticket)).toMatchObject({
      printStatus: 'PRINTED',
      preview,
      content: ticket.content,
    });
  });
});

describe('printer unavailable and retry (story 005)', () => {
  const offline = () => new PrinterUnavailableError('OFFLINE', 'status 503');

  it('stores the ticket as FAILED and answers with the printer state and the ticket id', async () => {
    const { printer, tickets, repo } = await completed();
    printer.fail = offline();
    const err = await tickets.generate('B-24187').catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'PRINTER_UNAVAILABLE',
      httpStatus: 503,
      details: { state: 'OFFLINE', printStatus: 'FAILED' },
    });
    const stored = repo.findOriginalByBatch('B-24187')!;
    expect(stored.snapshot()).toMatchObject({
      printStatus: 'FAILED',
      printAttempts: 1,
      lastError: { code: 'PRINTER_UNAVAILABLE', state: 'OFFLINE' },
      jobId: null,
    });
    expect((err as { details: { ticketId: string } }).details.ticketId).toBe(stored.ticketId);
    // the preview is still available
    expect(tickets.preview(tickets.get(stored.ticketId)).lines).toEqual(stored.content.lines);
  });

  it('out of paper is reported as that state', async () => {
    const { printer, tickets, repo } = await completed();
    printer.fail = new PrinterUnavailableError('OUT_OF_PAPER', 'status 503');
    await expect(tickets.generate('B-24187')).rejects.toMatchObject({
      details: { state: 'OUT_OF_PAPER' },
    });
    expect(repo.findOriginalByBatch('B-24187')!.snapshot().lastError?.state).toBe('OUT_OF_PAPER');
  });

  it('a failure changes nothing else: session, records and write-back stay as they were', async () => {
    const { t, printer, tickets, writeBacks } = await completed();
    const sessionBefore = t.w.ctx.sessions.findById(t.sid)!.snapshot();
    const recordsBefore = t.w.ctx.records.listBySession(t.sid);
    const auditBefore = t.w.auditLog.listForSession(t.sid).length;
    const writeBackBefore = writeBacks.status('B-24187');
    printer.fail = offline();
    await expect(tickets.generate('B-24187')).rejects.toBeDefined();
    expect(t.w.ctx.sessions.findById(t.sid)!.snapshot()).toEqual(sessionBefore);
    expect(t.w.ctx.records.listBySession(t.sid)).toEqual(recordsBefore);
    expect(t.w.auditLog.listForSession(t.sid)).toHaveLength(auditBefore);
    expect(writeBacks.status('B-24187')).toEqual(writeBackBefore);
  });

  it('retry prints the same ticket: PRINTED, attempt 2, same text, not marked REPRINT', async () => {
    const { t, printer, tickets, repo } = await completed();
    printer.fail = offline();
    await expect(tickets.generate('B-24187')).rejects.toBeDefined();
    const failed = repo.findOriginalByBatch('B-24187')!;
    printer.fail = null;
    const retried = await tickets.print(failed.ticketId);
    expect(retried.snapshot()).toMatchObject({
      ticketId: failed.ticketId,
      printStatus: 'PRINTED',
      printAttempts: 2,
      lastError: null,
      isReprint: false,
      reprintOf: null,
    });
    expect(retried.content.lines).not.toContain('*** REPRINT ***');
    expect(printer.prints.map((p) => p.lines)).toEqual([
      failed.content.lines,
      failed.content.lines,
    ]);
    expect(tickets.forBatch('B-24187')).toHaveLength(1); // no second ticket
    expect(reprints(t)).toEqual([]); // and no REPRINT audit from a retry
  });

  it('a retry that fails again counts the attempt and keeps the ticket', async () => {
    const { printer, tickets, repo } = await completed();
    printer.fail = offline();
    await expect(tickets.generate('B-24187')).rejects.toBeDefined();
    const id = repo.findOriginalByBatch('B-24187')!.ticketId;
    await expect(tickets.print(id)).rejects.toMatchObject({ details: { ticketId: id } });
    expect(repo.findById(id)!.snapshot()).toMatchObject({
      printStatus: 'FAILED',
      printAttempts: 2,
    });
  });

  it('asking for the batch ticket again after a failure returns the FAILED ticket and prints nothing', async () => {
    const { printer, tickets } = await completed();
    printer.fail = offline();
    await expect(tickets.generate('B-24187')).rejects.toBeDefined();
    printer.fail = null;
    const again = await tickets.generate('B-24187');
    expect(again.created).toBe(false);
    expect(again.ticket.printStatus).toBe('FAILED');
    expect(printer.prints).toHaveLength(1);
  });

  it('an unreadable printer answer is FAILED with state unknown and a 502', async () => {
    const { printer, tickets, repo } = await completed();
    printer.fail = new DeviceProtocolError('printer', 'bad body');
    await expect(tickets.generate('B-24187')).rejects.toMatchObject({
      code: 'DEVICE_PROTOCOL_ERROR',
      httpStatus: 502,
      details: { printStatus: 'FAILED' },
    });
    expect(repo.findOriginalByBatch('B-24187')!.snapshot()).toMatchObject({
      printStatus: 'FAILED',
      lastError: { code: 'DEVICE_PROTOCOL_ERROR', state: null },
    });
  });

  it('an unexpected error is not reported as a printer failure: it propagates and the ticket stays NOT_SENT', async () => {
    const { printer, tickets, repo } = await completed();
    printer.fail = new Error('boom');
    await expect(tickets.generate('B-24187')).rejects.toThrow('boom');
    expect(repo.findOriginalByBatch('B-24187')!.snapshot()).toMatchObject({
      printStatus: 'NOT_SENT',
      printAttempts: 0,
      lastError: null,
    });
  });

  it('printing a PRINTED ticket does nothing', async () => {
    const { printer, tickets } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    const again = await tickets.print(ticket.ticketId);
    expect(again.snapshot()).toMatchObject({ printStatus: 'PRINTED', printAttempts: 1 });
    expect(printer.prints).toHaveLength(1);
  });

  it('an unknown ticket → 404 TICKET_NOT_FOUND', async () => {
    const { tickets } = await completed();
    await expect(tickets.print('T-404')).rejects.toMatchObject({
      code: 'TICKET_NOT_FOUND',
      httpStatus: 404,
    });
    expect(() => tickets.get('T-404')).toThrow(/not found/);
  });
});

describe('reprint (story 006)', () => {
  it('a PRINTED ticket → a new ticket with identical content plus REPRINT, printed, audited', async () => {
    const { t, printer, tickets } = await completed();
    const { ticket: original } = await tickets.generate('B-24187');
    const copy = await tickets.reprint(original.ticketId);

    expect(copy.ticketId).not.toBe(original.ticketId);
    expect(copy.snapshot()).toMatchObject({
      isReprint: true,
      reprintOf: original.ticketId,
      printStatus: 'PRINTED',
      createdBy: 'OP-0417',
    });
    expect(copy.content.lines[1]).toBe('*** REPRINT ***');
    expect(copy.content.lines.filter((l) => l !== '*** REPRINT ***')).toEqual(
      original.content.lines,
    );
    expect(printer.prints[1]!.lines).toEqual(copy.content.lines);
    expect(printer.statusAtPrint).toEqual(['NOT_SENT', 'NOT_SENT']);

    const events = reprints(t);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: 'OP-0417',
      sessionId: t.sid,
      detail: {
        batchId: 'B-24187',
        originalTicketId: original.ticketId,
        ticketId: copy.ticketId,
      },
    });
    // the original is unchanged
    expect(tickets.get(original.ticketId).snapshot()).toEqual(original.snapshot());
    expect(tickets.forBatch('B-24187').map((x) => x.ticketId)).toEqual([
      original.ticketId,
      copy.ticketId,
    ]);
  });

  it('the audit actor is the signed-in operator, not the session operator', async () => {
    const { t, tickets } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    t.w.identification.signOut();
    t.w.identification.signIn('BDG-0901');
    const copy = await tickets.reprint(ticket.ticketId);
    expect(copy.snapshot().createdBy).toBe('OP-0901');
    expect(reprints(t)[0]!.actorId).toBe('OP-0901');
    expect(copy.content.operator).toBe(ticket.content.operator); // the ticket still names the weigher
  });

  it('nobody signed in → 401 NOT_SIGNED_IN; nothing stored, printed or audited', async () => {
    const { t, printer, tickets } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    t.w.identification.signOut();
    await expect(tickets.reprint(ticket.ticketId)).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
      httpStatus: 401,
    });
    expect(tickets.forBatch('B-24187')).toHaveLength(1);
    expect(printer.prints).toHaveLength(1);
    expect(reprints(t)).toEqual([]);
  });

  it('a ticket that never printed → 409 TICKET_NOT_PRINTED; nothing stored or audited', async () => {
    const { t, printer, tickets, repo } = await completed();
    printer.fail = new PrinterUnavailableError('OFFLINE', 'x');
    await expect(tickets.generate('B-24187')).rejects.toBeDefined();
    const failed = repo.findOriginalByBatch('B-24187')!;
    await expect(tickets.reprint(failed.ticketId)).rejects.toMatchObject({
      code: 'TICKET_NOT_PRINTED',
      httpStatus: 409,
      details: { printStatus: 'FAILED' },
    });
    expect(tickets.forBatch('B-24187')).toHaveLength(1);
    expect(reprints(t)).toEqual([]);
  });

  it('no such ticket → 404 TICKET_NOT_FOUND', async () => {
    const { tickets } = await completed();
    await expect(tickets.reprint('T-404')).rejects.toMatchObject({ code: 'TICKET_NOT_FOUND' });
  });

  it('the printer down: the reprint is stored and audited, FAILED and still REPRINT after its retry', async () => {
    const { t, printer, tickets, repo } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    printer.fail = new PrinterUnavailableError('OUT_OF_PAPER', 'x');
    const err = await tickets.reprint(ticket.ticketId).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'PRINTER_UNAVAILABLE', details: { state: 'OUT_OF_PAPER' } });
    const copyId = (err as { details: { ticketId: string } }).details.ticketId;
    expect(copyId).not.toBe(ticket.ticketId);
    expect(repo.findById(copyId)!.snapshot()).toMatchObject({
      isReprint: true,
      printStatus: 'FAILED',
    });
    expect(reprints(t)).toHaveLength(1);

    printer.fail = null;
    const retried = await tickets.print(copyId);
    expect(retried.snapshot()).toMatchObject({ printStatus: 'PRINTED', isReprint: true });
    expect(retried.content.lines[1]).toBe('*** REPRINT ***');
    expect(reprints(t)).toHaveLength(1); // the retry is not a new reprint
  });

  it('several reprints are allowed, each its own ticket and audit event; a copy can be copied', async () => {
    const { t, tickets } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    const a = await tickets.reprint(ticket.ticketId);
    const b = await tickets.reprint(ticket.ticketId);
    const c = await tickets.reprint(a.ticketId);
    expect(new Set([ticket.ticketId, a.ticketId, b.ticketId, c.ticketId]).size).toBe(4);
    expect(c.snapshot().reprintOf).toBe(a.ticketId);
    expect(c.content.lines.filter((l) => l === '*** REPRINT ***')).toHaveLength(1);
    expect(reprints(t)).toHaveLength(3);
  });

  it('the reprint and its audit event are stored together: an audit failure leaves no ticket', async () => {
    const { t, tickets } = await completed();
    const { ticket } = await tickets.generate('B-24187');
    const original = t.w.ctx.audit.append.bind(t.w.ctx.audit);
    t.w.ctx.audit.append = () => {
      throw new Error('audit store down');
    };
    await expect(tickets.reprint(ticket.ticketId)).rejects.toThrow('audit store down');
    t.w.ctx.audit.append = original;
    expect(tickets.forBatch('B-24187')).toHaveLength(1);
  });
});

describe('forBatch', () => {
  it('an unknown batch → 404; a completed batch without a ticket → empty list', async () => {
    const { tickets } = await completed();
    expect(tickets.forBatch('B-24187')).toEqual([]);
    expect(() => tickets.forBatch('B-99999')).toThrowError(/B-99999/);
  });
});
