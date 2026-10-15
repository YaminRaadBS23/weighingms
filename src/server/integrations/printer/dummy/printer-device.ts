/** Simulated ticket printer (Dummy Printer, training only): keeps printed jobs in memory. */
import { randomUUID } from 'node:crypto';
import type { DummyPrintJob, DummyPrinterState, DummyPrintRequest } from './contract';

export class PrinterDeviceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly state?: DummyPrinterState,
  ) {
    super(message);
  }
}

export const PRINTER_STATES: DummyPrinterState[] = ['READY', 'OFFLINE', 'OUT_OF_PAPER'];

export function renderPreview(lines: string[], barcode: string | null): string {
  return [...lines, ...(barcode ? [`[barcode: ${barcode}]`] : [])].join('\n');
}

export class PrinterDevice {
  private jobs: DummyPrintJob[] = [];
  state: DummyPrinterState = 'READY';

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Prints and stores the job; fails with 503 and the state when the printer is not READY. */
  print(doc: DummyPrintRequest): DummyPrintJob {
    if (this.state !== 'READY') {
      throw new PrinterDeviceError(
        503,
        this.state === 'OFFLINE' ? 'PRINTER_OFFLINE' : 'PRINTER_OUT_OF_PAPER',
        `Printer cannot print (${this.state})`,
        this.state,
      );
    }
    const job: DummyPrintJob = {
      jobId: randomUUID(),
      documentId: doc.documentId,
      status: 'PRINTED',
      printedAt: this.now().toISOString(),
      lines: [...doc.lines],
      barcode: doc.barcode,
      preview: renderPreview(doc.lines, doc.barcode),
    };
    this.jobs.push(job);
    return job;
  }

  listJobs(): DummyPrintJob[] {
    return [...this.jobs];
  }

  reset(): void {
    this.jobs = [];
    this.state = 'READY';
  }
}
