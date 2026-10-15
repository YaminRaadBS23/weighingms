/**
 * ScannerPort — WeighingMS' only way to receive barcode scans.
 * Errors: ScannerUnavailableError (503), DeviceProtocolError (502).
 */
export interface RawScan {
  seq: number;
  code: string;
  at: string;
}

export interface ScannerPort {
  getStatus(): Promise<'READY' | 'OFFLINE'>;
  /** Raw scans after `since`, and the cursor to pass next time. */
  scansSince(since: number): Promise<{ scans: RawScan[]; cursor: number }>;
}
