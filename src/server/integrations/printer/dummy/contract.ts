/**
 * Wire format of the Dummy Printer HTTP API (`/ext/printer/...`).
 * TRAINING CONTRACT ONLY — the real printer and label format are unknown (brief A-04, Q18).
 */
export type DummyPrinterState = 'READY' | 'OFFLINE' | 'OUT_OF_PAPER';

export interface DummyPrinterStatus {
  state: DummyPrinterState;
}

/** A printable document: lines of text and an optional barcode value. */
export interface DummyPrintRequest {
  documentId: string;
  lines: string[];
  barcode: string | null;
}

export interface DummyPrintJob {
  jobId: string;
  documentId: string;
  status: 'PRINTED';
  printedAt: string;
  lines: string[];
  barcode: string | null;
  /** Plain-text rendering of what was printed. */
  preview: string;
}

export interface DummyPrintJobList {
  items: DummyPrintJob[];
}
