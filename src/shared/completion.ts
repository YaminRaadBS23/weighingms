/** Contract of the completion API: consumption write-back and completion summary (bolt 014). */
import type { Quantity } from './quantity';

export type WriteBackStatus = 'PENDING' | 'CONFIRMED';

export interface WriteBackFailureView {
  code: string;
  message: string;
}

/** State of the write-back of a completed batch to OrgaTEX (ADR-10). */
export interface WriteBackView {
  batchId: string;
  sessionId: string;
  status: WriteBackStatus;
  /** False only for a completed batch that nobody has sent yet (it still counts as pending). */
  requested: boolean;
  attempts: number;
  idempotencyKey: string | null;
  /** OrgaTEX's id of the stored posting, once acknowledged. */
  postingId: string | null;
  /** When OrgaTEX received the posting ("Written to OrgaTEX CONFIRMED hh:mm:ss"). */
  confirmedAt: string | null;
  lastError: WriteBackFailureView | null;
  /** Number of component lines in the posting. */
  lines: number;
}

export interface PendingCountResponse {
  count: number;
}

/** Numbers on the Confirm & print screen; computed from the records on every read. */
export interface CompletionSummaryResponse {
  batchId: string;
  sessionId: string;
  componentsWeighed: number;
  componentsTotal: number;
  /** False as soon as one record is OVERRIDDEN. */
  allWithinTolerance: boolean;
  /** Exact sum of the actuals, in kg with 3 decimals. */
  totalDispensed: Quantity;
  startedAt: string;
  completedAt: string;
  elapsedSeconds: number;
  operator: { operatorId: string; name: string };
  writeBack: WriteBackView;
}
