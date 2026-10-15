/** Simulated barcode scanner (Dummy Scanner, training only): an append-only buffer of raw scans. */
import type { DummyScan, DummyScanFeed } from './contract';

export class ScannerDeviceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class ScannerDevice {
  private scans: DummyScan[] = [];
  private seq = 0;
  online = true;

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Records a raw code exactly as scanned. Refused while offline (a dead scanner cannot scan). */
  scan(code: string): DummyScan {
    if (!this.online) {
      throw new ScannerDeviceError(409, 'SCANNER_OFFLINE', 'Scanner is offline (simulated)');
    }
    this.seq += 1;
    const event = { seq: this.seq, code, at: this.now().toISOString() };
    this.scans.push(event);
    return event;
  }

  /** Scans with a sequence number greater than `since`, plus the cursor to use next time. */
  feed(since: number): DummyScanFeed {
    if (!this.online) {
      throw new ScannerDeviceError(503, 'SCANNER_OFFLINE', 'Scanner is offline (simulated)');
    }
    return { items: this.scans.filter((s) => s.seq > since), cursor: this.seq };
  }

  reset(): void {
    this.scans = [];
    this.seq = 0;
    this.online = true;
  }
}
