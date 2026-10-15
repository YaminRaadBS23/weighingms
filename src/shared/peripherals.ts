/** Contract types of the WeighingMS `/api/scanner` and `/api/printer` APIs, shared with the station UI. */
import type { ScanKind } from './scan-codes';

export type ScannerState = 'READY' | 'OFFLINE';
export type PrinterState = 'READY' | 'OFFLINE' | 'OUT_OF_PAPER';

export interface ScannerStatusResponse {
  state: ScannerState;
}

/** One scanned (SCANNER) or typed (MANUAL) code, already normalised and classified. */
export interface ScanEvent {
  /** Position in the scanner feed; null for typed codes. */
  seq: number | null;
  code: string;
  kind: ScanKind;
  source: 'SCANNER' | 'MANUAL';
  at: string;
}

/** Response of GET /api/scanner/scans?since=N — poll again with `cursor` to get only newer scans. */
export interface ScanFeedResponse {
  items: ScanEvent[];
  cursor: number;
}

export interface ManualCodeRequest {
  code: string;
}

export interface PrinterStatusResponse {
  state: PrinterState;
}
