import { and, asc, eq } from 'drizzle-orm';
import type { PrintStatus, TicketContent } from '../../../../shared/ticket';
import type { WeighingDb } from '../../../db/weighingms/db';
import { tickets } from '../../../db/weighingms/schema';
import type { TicketRepository } from '../domain/repositories';
import { Ticket } from '../domain/ticket';

type Row = typeof tickets.$inferSelect;

const toRow = (ticket: Ticket): Row => {
  const p = ticket.snapshot();
  return {
    ticketId: p.ticketId,
    batchId: p.batchId,
    sessionId: p.sessionId,
    isReprint: p.isReprint,
    reprintOf: p.reprintOf,
    content: JSON.stringify(p.content),
    barcodeValue: p.content.barcodeValue,
    printStatus: p.printStatus,
    printAttempts: p.printAttempts,
    lastErrorCode: p.lastError?.code ?? null,
    lastErrorState: p.lastError?.state ?? null,
    lastErrorMessage: p.lastError?.message ?? null,
    jobId: p.jobId,
    printedAt: p.printedAt,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

const fromRow = (r: Row): Ticket =>
  Ticket.restore({
    ticketId: r.ticketId,
    batchId: r.batchId,
    sessionId: r.sessionId,
    isReprint: r.isReprint,
    reprintOf: r.reprintOf,
    content: JSON.parse(r.content) as TicketContent,
    printStatus: r.printStatus as PrintStatus,
    printAttempts: r.printAttempts,
    lastError:
      r.lastErrorCode !== null
        ? {
            code: r.lastErrorCode,
            state: r.lastErrorState as 'OFFLINE' | 'OUT_OF_PAPER' | null,
            message: r.lastErrorMessage ?? '',
          }
        : null,
    jobId: r.jobId,
    printedAt: r.printedAt,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });

export class DrizzleTicketRepository implements TicketRepository {
  constructor(private readonly db: WeighingDb) {}

  create(ticket: Ticket): void {
    this.db.insert(tickets).values(toRow(ticket)).run();
  }

  /** Stores the print outcome; content and identity columns are never written. */
  save(ticket: Ticket): void {
    const row = toRow(ticket);
    const outcome = {
      printStatus: row.printStatus,
      printAttempts: row.printAttempts,
      lastErrorCode: row.lastErrorCode,
      lastErrorState: row.lastErrorState,
      lastErrorMessage: row.lastErrorMessage,
      jobId: row.jobId,
      printedAt: row.printedAt,
      updatedAt: row.updatedAt,
    };
    this.db.update(tickets).set(outcome).where(eq(tickets.ticketId, row.ticketId)).run();
  }

  findById(ticketId: string): Ticket | undefined {
    const row = this.db.select().from(tickets).where(eq(tickets.ticketId, ticketId)).get();
    return row ? fromRow(row) : undefined;
  }

  findOriginalByBatch(batchId: string): Ticket | undefined {
    const row = this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.batchId, batchId), eq(tickets.isReprint, false)))
      .get();
    return row ? fromRow(row) : undefined;
  }

  listByBatch(batchId: string): Ticket[] {
    return this.db
      .select()
      .from(tickets)
      .where(eq(tickets.batchId, batchId))
      .orderBy(asc(tickets.createdAt), asc(tickets.isReprint))
      .all()
      .map(fromRow);
  }
}
