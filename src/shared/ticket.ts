/** Contract of the ticket API: weighing ticket, print outcome, preview and reprint (bolt 015, ADR-11). */

export type PrintStatus = 'NOT_SENT' | 'PRINTED' | 'FAILED';

export interface TicketRow {
  shortName: string;
  /** In the recipe's unit, to the unit's display precision. */
  target: string;
  /** Converted exactly to the recipe's unit, shown to the unit's display precision. */
  actual: string;
  unit: string;
}

/** What the ticket says. Composed once and never changed; `lines` is what is printed and previewed. */
export interface TicketContent {
  title: string;
  batch: string;
  order: string;
  machine: string;
  shade: string;
  /** Completion time in UTC, `YYYY-MM-DD HH:mm`. */
  date: string;
  operator: string;
  rows: TicketRow[];
  /** "ALL WITHIN TOLERANCE", or one EXCEPTION line per overridden component. */
  verdict: string[];
  barcodeValue: string;
  reprint: boolean;
  lines: string[];
}

export interface TicketFailureView {
  code: string;
  state: 'OFFLINE' | 'OUT_OF_PAPER' | null;
  message: string;
}

export interface TicketPreview {
  ticketId: string;
  isReprint: boolean;
  lines: string[];
  barcode: { value: string; symbology: 'CODE128'; svg: string };
}

export interface TicketView {
  ticketId: string;
  batchId: string;
  sessionId: string;
  isReprint: boolean;
  /** The ticket this one is a copy of (reprints only). */
  reprintOf: string | null;
  printStatus: PrintStatus;
  printAttempts: number;
  lastError: TicketFailureView | null;
  jobId: string | null;
  printedAt: string | null;
  createdAt: string;
  content: TicketContent;
  preview: TicketPreview;
}

export interface CreateTicketRequest {
  batchId: string;
}

export interface BatchTicketsResponse {
  tickets: TicketView[];
}
