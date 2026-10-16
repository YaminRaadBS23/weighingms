import { useRef } from 'react';
import type { ScanEvent } from '../../shared/peripherals';
import { api } from '../services/api-client';
import { usePolling } from './usePolling';

export const SCAN_POLL_MS = 300;

/**
 * Delivers each new scanner event to `onScan` exactly once while `enabled`. Scans made before
 * the screen opened are skipped: the first poll only establishes the cursor.
 */
export function useScanFeed(onScan: (e: ScanEvent) => void, enabled = true) {
  const cursor = useRef<number | null>(null);
  const handler = useRef(onScan);
  handler.current = onScan;

  usePolling(
    async () => {
      try {
        if (cursor.current === null) {
          cursor.current = (await api.scans(0)).cursor;
          return;
        }
        const feed = await api.scans(cursor.current);
        cursor.current = feed.cursor;
        for (const e of feed.items) handler.current(e);
      } catch {
        // Scanner offline: the status strip shows it; typed entry keeps working (FR-34).
      }
    },
    SCAN_POLL_MS,
    enabled,
  );
}
