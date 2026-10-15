/**
 * PrinterPort — WeighingMS' only way to print tickets.
 * Errors: PrinterUnavailableError (503, with OFFLINE / OUT_OF_PAPER), DeviceProtocolError (502).
 */
export type PrinterStateValue = 'READY' | 'OFFLINE' | 'OUT_OF_PAPER';

/** A printable document; the ticket layout is decided by the ticket module (bolt 015). */
export interface PrintDocument {
  documentId: string;
  lines: string[];
  /** Value to encode as a barcode (e.g. the batch ID), or null. */
  barcode: string | null;
}

export interface PrintResult {
  jobId: string;
  documentId: string;
  printedAt: string;
  preview: string;
}

export interface PrinterPort {
  getStatus(): Promise<PrinterStateValue>;
  print(doc: PrintDocument): Promise<PrintResult>;
  listJobs(): Promise<PrintResult[]>;
}
