/** Pure view-model of the Confirm & print screen: texts, tones and key states (no React, no timers). */
import type { WriteBackView } from '../../../shared/completion';
import type { TicketView } from '../../../shared/ticket';
import { hasMessage, t } from '../../i18n/messages';
import { hhmmss } from '../../shared/format';

/** "6 min 41 s", "45 s", "1 h 05 min". */
export function elapsedText(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return t('done.elapsed.hours', { h, m: String(m).padStart(2, '0') });
  if (m > 0) return t('done.elapsed.minutes', { m, s });
  return t('done.elapsed.seconds', { s });
}

export interface WriteBackRow {
  tone: 'ok' | 'warn';
  /** "CONFIRMED 07:48:22" or "PENDING". */
  text: string;
  /** Why it is pending, or "attempt n"; null when confirmed. */
  detail: string | null;
  attempts: string | null;
  showRetry: boolean;
}

/** The "Written to OrgaTEX" row from the write-back state; `sending` while a send is running. */
export function writeBackRow(wb: WriteBackView | null, sending: boolean): WriteBackRow {
  if (sending) {
    return {
      tone: 'warn',
      text: t('done.wb.sending'),
      detail: null,
      attempts: null,
      showRetry: false,
    };
  }
  if (wb?.status === 'CONFIRMED') {
    const time = wb.confirmedAt ? hhmmss(new Date(wb.confirmedAt)) : '';
    return {
      tone: 'ok',
      text: t('done.wb.confirmed', { time }).trim(),
      detail: null,
      attempts: null,
      showRetry: false,
    };
  }
  return {
    tone: 'warn',
    text: t('done.wb.pending'),
    detail: wb?.lastError ? writeBackError(wb.lastError) : t('done.wb.notSent'),
    attempts: wb && wb.attempts > 0 ? t('done.wb.attempts', { n: wb.attempts }) : null,
    showRetry: true,
  };
}

/** Operator wording for a write-back failure code. */
export function writeBackError(error: { code: string; message: string }): string {
  const key = `done.wb.error.${error.code}`;
  return hasMessage(key) ? t(key) : t('done.wb.error.other', { message: error.message });
}

/** The ticket the screen works with: the newest one (the original, or the last copy). */
export function currentTicket(tickets: readonly TicketView[]): TicketView | null {
  return tickets.length > 0 ? tickets[tickets.length - 1]! : null;
}

export const printedCopies = (tickets: readonly TicketView[]): number =>
  tickets.filter((x) => x.isReprint && x.printStatus === 'PRINTED').length;

export interface PrinterFailure {
  code: string;
  state: string | null;
  message: string;
}

/** Operator wording for a refused print: what is wrong, and that the ticket is kept. */
export function printerFailureText(f: PrinterFailure): string {
  if (f.code === 'PRINTER_UNAVAILABLE') {
    const reason =
      f.state === 'OUT_OF_PAPER'
        ? t('done.ticket.printerOutOfPaper')
        : f.state === 'OFFLINE'
          ? t('done.ticket.printerOffline')
          : t('done.ticket.printerOther');
    return t('done.ticket.kept', { reason });
  }
  if (f.code === 'DEVICE_PROTOCOL_ERROR') {
    return t('done.ticket.kept', { reason: t('done.ticket.printerOther') });
  }
  return t('done.ticket.failed', { message: f.message });
}

export interface DoneKeys {
  /** What F1 / the large green key does now. */
  primary: 'PRINT' | 'RETRY' | 'PRINTED';
  primaryLabel: string;
  primaryEnabled: boolean;
  reprintVisible: boolean;
  reprintEnabled: boolean;
  nextEnabled: boolean;
}

/** Key states: Print without a ticket, Retry for a ticket that is not printed, Reprint after a print. */
export function doneKeys(ticket: TicketView | null, busy: boolean): DoneKeys {
  const printed = ticket?.printStatus === 'PRINTED';
  const primary = !ticket ? 'PRINT' : printed ? 'PRINTED' : 'RETRY';
  return {
    primary,
    primaryLabel: t(
      primary === 'PRINT'
        ? 'done.key.print'
        : primary === 'RETRY'
          ? 'done.key.retryPrint'
          : 'done.key.printed',
    ),
    primaryEnabled: primary !== 'PRINTED' && !busy,
    reprintVisible: printed,
    reprintEnabled: printed && !busy,
    nextEnabled: !busy,
  };
}

/** The barcode image source for an SVG string: an image, so no markup is ever executed. */
export const svgDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
