import { useState } from 'react';
import type { PrinterState, ScannerState } from '../../shared/peripherals';
import type { ScaleSummary } from '../../shared/scales';
import { api } from '../services/api-client';
import { t, type MessageKey } from '../i18n/messages';
import { capacity, hhmm, hhmmss } from '../shared/format';
import { usePolling } from '../shared/usePolling';
import styles from './StatusStrip.module.css';

export const STATUS_POLL_MS = 2000;

type Tone = 'up' | 'warn' | 'down';

interface Item {
  key: string;
  label: string;
  state: string;
  tone: Tone;
}

interface Snapshot {
  scales: ScaleSummary[] | null;
  scanner: ScannerState | null;
  printer: PrinterState | null;
  orgatex: { state: 'ONLINE' | 'OFFLINE'; lastContactAt: string | null } | null;
  /** Completed batches whose write-back OrgaTEX has not confirmed (null: unknown). */
  pending: number | null;
}

const stateText = (s: string) => t(`state.${s}` as MessageKey);
const toneOf = (s: string): Tone => (s === 'READY' ? 'up' : s === 'OFFLINE' ? 'down' : 'warn');

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * Prototype `.strip`: scales, scanner, printer, OrgaTEX link, language and clock, refreshed every
 * 2 s (FR-32). Every state has text as well as a coloured dot.
 */
export function StatusStrip({ now }: { now: Date }) {
  const [snap, setSnap] = useState<Snapshot>({
    scales: null,
    scanner: null,
    printer: null,
    orgatex: null,
    pending: null,
  });

  usePolling(async () => {
    const [scales, scanner, printer, orgatex, pending] = await Promise.all([
      settle(api.scales()),
      settle(api.scannerStatus()),
      settle(api.printerStatus()),
      settle(api.orgatexStatus()),
      settle(api.pendingCount()),
    ]);
    setSnap({
      scales: scales?.items ?? null,
      scanner: scanner?.state ?? 'OFFLINE',
      printer: printer?.state ?? 'OFFLINE',
      orgatex: orgatex ?? { state: 'OFFLINE', lastContactAt: null },
      pending: pending?.count ?? null,
    });
  }, STATUS_POLL_MS);

  const items: Item[] = [
    ...(snap.scales ?? []).map((s) => ({
      key: s.scaleId,
      label: t('strip.scale', { capacity: capacity(s.capacity) }),
      state: stateText(s.state),
      tone: toneOf(s.state),
    })),
    {
      key: 'scanner',
      label: t('strip.scanner'),
      state: stateText(snap.scanner ?? 'UNKNOWN'),
      tone: snap.scanner ? toneOf(snap.scanner) : 'warn',
    },
    {
      key: 'printer',
      label: t('strip.printer'),
      state: stateText(snap.printer ?? 'UNKNOWN'),
      tone: snap.printer ? toneOf(snap.printer) : 'warn',
    },
    {
      key: 'orgatex',
      label: t('strip.orgatex'),
      state:
        snap.orgatex?.state === 'ONLINE' && snap.orgatex.lastContactAt
          ? t('strip.linked', { time: hhmm(snap.orgatex.lastContactAt) })
          : stateText(snap.orgatex ? 'OFFLINE' : 'UNKNOWN'),
      tone: snap.orgatex?.state === 'ONLINE' ? 'up' : snap.orgatex ? 'down' : 'warn',
    },
    // Only shown while a completed batch still waits for OrgaTEX (FR-28); the Confirm & print
    // screen of that batch has the Retry key.
    ...(snap.pending
      ? [
          {
            key: 'writeback',
            label: t('strip.writeback'),
            state: t('strip.writebackPending', { count: snap.pending }),
            tone: 'warn' as Tone,
          },
        ]
      : []),
  ];

  return (
    <footer className={styles.strip} aria-label="Station status">
      {items.map((i) => (
        <span key={i.key} className={styles.stat} data-testid={`stat-${i.key}`}>
          <span className={`${styles.dot} ${styles[i.tone]}`} aria-hidden="true" />
          {i.label} · {i.state}
        </span>
      ))}
      <span className={styles.spacer} />
      <span className={styles.stat}>{t('strip.language')}</span>
      <span className={styles.stat} data-testid="clock">
        {hhmmss(now)}
      </span>
    </footer>
  );
}
