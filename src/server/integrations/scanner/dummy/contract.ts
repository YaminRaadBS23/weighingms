/**
 * Wire format of the Dummy Scanner HTTP API (`/ext/scanner/...`).
 * TRAINING CONTRACT ONLY — the real scanner interface is unknown (brief A-10, IR-15).
 */
export interface DummyScannerStatus {
  state: 'READY' | 'OFFLINE';
}

/** One raw scan as the scanner reports it (no classification). */
export interface DummyScan {
  seq: number;
  code: string;
  at: string;
}

export interface DummyScanFeed {
  items: DummyScan[];
  cursor: number;
}
