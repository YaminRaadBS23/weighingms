/**
 * Use cases: the weighing ticket of a completed batch — create and print, retry, preview, reprint
 * (FR-29, FR-30, FR-35, ADR-11). The ticket is stored before the printer is called; a refusal is
 * saved as FAILED and then answered with the port's error. No OrgaTEX call is made.
 */
import { normaliseCode } from '../../../../shared/scan-codes';
import type { TicketPreview, TicketView } from '../../../../shared/ticket';
import { DeviceProtocolError, PrinterUnavailableError } from '../../../errors';
import type { PrinterPort } from '../../../integrations/printer/printer-port';
import type { AuditLog } from '../../weighing/application/audit-log';
import type { WeighingContext } from '../../weighing/application/context';
import type { OperatorIdentification } from '../../weighing/application/operator-identification';
import { SessionLock } from '../../weighing/application/session-lock';
import { SessionNotFoundError } from '../../weighing/domain/errors';
import { toSvg } from '../domain/code128';
import { WriteBackBatchIncompleteError } from '../domain/errors';
import type { CompletedBatchReader, TicketRepository } from '../domain/repositories';
import { Ticket } from '../domain/ticket';
import { asReprint, compose } from '../domain/ticket-composer';
import {
  TicketNotFoundError,
  TicketNotPrintedError,
  TicketPrintError,
} from '../domain/ticket-errors';

export class TicketService {
  /** Serialises the ticket operations of one batch (D-4): no double create, no double print. */
  private readonly lock = new SessionLock();

  constructor(
    private readonly ctx: WeighingContext,
    private readonly reader: CompletedBatchReader,
    private readonly repo: TicketRepository,
    private readonly printer: PrinterPort,
    private readonly identification: OperatorIdentification,
    private readonly auditLog: AuditLog,
  ) {}

  /**
   * The batch's original ticket, composed and printed now. Asking again returns the stored one
   * and prints nothing (`created: false`).
   */
  async generate(rawBatchId: string): Promise<{ ticket: Ticket; created: boolean }> {
    const batchId = normaliseCode(rawBatchId);
    const found = this.reader.read(batchId);
    if (found.state === 'NONE') throw new SessionNotFoundError(batchId);
    if (found.state === 'OPEN') {
      throw new WriteBackBatchIncompleteError(422, found.done, found.total);
    }
    const { session, records } = found;
    return this.lock.run(batchId, async () => {
      const existing = this.repo.findOriginalByBatch(batchId);
      if (existing) return { ticket: existing, created: false };

      const operator = this.ctx.operators.findById(session.startedBy);
      const ticket = Ticket.create({
        ticketId: this.ctx.newId(),
        batchId,
        sessionId: session.sessionId,
        content: compose({ session, records, operator }),
        reprintOf: null,
        createdBy: session.startedBy,
        now: this.ctx.now(),
      });
      this.repo.create(ticket);
      this.ctx.logger.info(
        { event: 'ticket-composed', ticketId: ticket.ticketId, batchId },
        'Ticket composed',
      );
      await this.send(ticket);
      return { ticket, created: true };
    });
  }

  /** Prints a stored ticket again (retry). A PRINTED ticket is returned unchanged. */
  async print(ticketId: string): Promise<Ticket> {
    const batchId = this.get(ticketId).batchId;
    return this.lock.run(batchId, async () => {
      const ticket = this.get(ticketId);
      if (!ticket.isPrinted) await this.send(ticket);
      return ticket;
    });
  }

  /** A marked copy of a printed ticket: stored with its audit event, then printed (FR-30). */
  async reprint(ticketId: string): Promise<Ticket> {
    const operator = this.identification.requireCurrent();
    const batchId = this.get(ticketId).batchId;
    return this.lock.run(batchId, async () => {
      const source = this.get(ticketId);
      if (!source.isPrinted) throw new TicketNotPrintedError(ticketId, source.printStatus);

      const copy = Ticket.create({
        ticketId: this.ctx.newId(),
        batchId,
        sessionId: source.sessionId,
        content: asReprint(source.content),
        reprintOf: source.ticketId,
        createdBy: operator.operatorId,
        now: this.ctx.now(),
      });
      // One transaction: the new ticket and its audit event are stored together, or neither.
      this.ctx.atomically(() => {
        this.repo.create(copy);
        this.auditLog.record('REPRINT', operator.operatorId, source.sessionId, {
          batchId,
          originalTicketId: source.ticketId,
          ticketId: copy.ticketId,
        });
      });
      this.ctx.logger.info(
        { event: 'ticket-reprinted', ticketId: copy.ticketId, originalTicketId: source.ticketId },
        'Ticket reprint created',
      );
      await this.send(copy);
      return copy;
    });
  }

  get(ticketId: string): Ticket {
    const ticket = this.repo.findById(ticketId);
    if (!ticket) throw new TicketNotFoundError(ticketId);
    return ticket;
  }

  /** The batch's tickets, original first; an unknown batch is 404. */
  forBatch(rawBatchId: string): Ticket[] {
    const batchId = normaliseCode(rawBatchId);
    if (this.reader.read(batchId).state === 'NONE') throw new SessionNotFoundError(batchId);
    return this.repo.listByBatch(batchId);
  }

  preview(ticket: Ticket): TicketPreview {
    const { content } = ticket;
    return {
      ticketId: ticket.ticketId,
      isReprint: ticket.isReprint,
      lines: content.lines,
      barcode: {
        value: content.barcodeValue,
        symbology: 'CODE128',
        svg: toSvg(content.barcodeValue),
      },
    };
  }

  view(ticket: Ticket): TicketView {
    const p = ticket.snapshot();
    return {
      ticketId: p.ticketId,
      batchId: p.batchId,
      sessionId: p.sessionId,
      isReprint: p.isReprint,
      reprintOf: p.reprintOf,
      printStatus: p.printStatus,
      printAttempts: p.printAttempts,
      lastError: p.lastError,
      jobId: p.jobId,
      printedAt: p.printedAt,
      createdAt: p.createdAt,
      content: p.content,
      preview: this.preview(ticket),
    };
  }

  /**
   * Sends the stored lines to the printer and stores the outcome. A refusal is saved as FAILED and
   * thrown as the port's error with the ticket id; any other error is a defect and is not swallowed.
   */
  private async send(ticket: Ticket): Promise<void> {
    const { content } = ticket;
    try {
      const job = await this.printer.print({
        documentId: ticket.ticketId,
        lines: content.lines,
        barcode: content.barcodeValue,
      });
      ticket.markPrinted({ jobId: job.jobId, printedAt: job.printedAt }, this.ctx.now());
      this.repo.save(ticket);
      this.ctx.logger.info(
        {
          event: 'ticket-printed',
          ticketId: ticket.ticketId,
          batchId: ticket.batchId,
          jobId: job.jobId,
          attempt: ticket.snapshot().printAttempts,
        },
        'Ticket printed',
      );
    } catch (err) {
      if (!(err instanceof PrinterUnavailableError || err instanceof DeviceProtocolError))
        throw err;
      ticket.markFailed(
        {
          code: err.code,
          state: err instanceof PrinterUnavailableError ? err.state : null,
          message: err.message,
        },
        this.ctx.now(),
      );
      this.repo.save(ticket);
      this.ctx.logger.warn(
        {
          event: 'ticket-print-failed',
          ticketId: ticket.ticketId,
          batchId: ticket.batchId,
          attempt: ticket.snapshot().printAttempts,
          reason: err.code,
        },
        'Ticket print failed',
      );
      throw new TicketPrintError(err, ticket.ticketId);
    }
  }
}
