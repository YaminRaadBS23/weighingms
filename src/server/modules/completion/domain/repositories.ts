/** Ports of the completion context (implemented in infrastructure/). */
import type { WeighingRecord } from '../../weighing/domain/weighing-record';
import type { WeighingSessionProps } from '../../weighing/domain/weighing-session';
import type { ConsumptionWriteBack } from './write-back';
import type { Ticket } from './ticket';

/**
 * No update of identity and no delete: the database refuses both (ADR-10, migration 0009).
 * `save` stores the outcome of an attempt.
 */
export interface WriteBackRepository {
  create(writeBack: ConsumptionWriteBack): void;
  save(writeBack: ConsumptionWriteBack): void;
  findByBatch(batchId: string): ConsumptionWriteBack | undefined;
  /** Batches whose write-back is CONFIRMED. */
  confirmedBatchIds(): Set<string>;
}

/** What the completion context may know about a batch, read from the weighing context. */
export type BatchCompletion =
  | { state: 'NONE' }
  | { state: 'OPEN'; done: number; total: number }
  | { state: 'COMPLETED'; session: WeighingSessionProps; records: WeighingRecord[] };

export interface CompletedBatchReader {
  read(batchId: string): BatchCompletion;
  /** Batch ids with a COMPLETED session. */
  completedBatchIds(): string[];
}

/**
 * No delete, and content and identity are never updated: the database refuses both (ADR-11,
 * migration 0011). `save` stores the print outcome only.
 */
export interface TicketRepository {
  create(ticket: Ticket): void;
  save(ticket: Ticket): void;
  findById(ticketId: string): Ticket | undefined;
  /** The batch's original (not a reprint) ticket. */
  findOriginalByBatch(batchId: string): Ticket | undefined;
  /** Oldest first: the original, then the reprints. */
  listByBatch(batchId: string): Ticket[];
}
