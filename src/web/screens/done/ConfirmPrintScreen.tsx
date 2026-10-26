import { useEffect, useRef, useState } from 'react';
import type { CompletionSummaryResponse, WriteBackView } from '../../../shared/completion';
import type { TicketView } from '../../../shared/ticket';
import type { SessionView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import { api, ApiError } from '../../services/api-client';
import { currentTicket, doneKeys, printerFailureText } from './done-model';
import { SummaryPanel } from './SummaryPanel';
import { TicketPanel } from './TicketPanel';
import styles from './ConfirmPrintScreen.module.css';

interface Props {
  /** The COMPLETED session. */
  session: SessionView;
  /** Next batch (F3): back to Select batch, which re-fetches the queue. */
  onLeave: () => void;
}

const PRINTER_ERRORS = new Set(['PRINTER_UNAVAILABLE', 'DEVICE_PROTOCOL_ERROR']);

/**
 * Prototype view 3 · Confirm & print (FR-26..FR-31, FR-35). It shows what the server says: the
 * summary, the write-back state and the stored ticket. Opening it sends the consumption once
 * (ADR-10: the client triggers the send; the server keeps the key and makes it idempotent).
 */
export function ConfirmPrintScreen({ session, onLeave }: Props) {
  const batchId = session.batchId;
  const [summary, setSummary] = useState<CompletionSummaryResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [writeBack, setWriteBack] = useState<WriteBackView | null>(null);
  const [sending, setSending] = useState(true);
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadId, setLoadId] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    api
      .summary(batchId)
      .then((s) => active && setSummary(s))
      .catch(() => active && setLoadFailed(true));
    api
      .ticketsForBatch(batchId)
      .then((r) => active && setTickets(r.tickets))
      .catch(() => undefined);
    api
      .postConsumption(batchId)
      .then((wb) => active && setWriteBack(wb))
      .catch(() => undefined)
      .finally(() => active && setSending(false));
    return () => {
      active = false;
    };
  }, [batchId, loadId]);

  /** One request at a time: a double click or a held F-key cannot send twice. */
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const refreshTickets = async () => setTickets((await api.ticketsForBatch(batchId)).tickets);

  /** A refused print keeps the ticket: show why and reload the list to show the stored ticket. */
  const showPrintError = async (err: unknown) => {
    if (err instanceof ApiError && PRINTER_ERRORS.has(err.code)) {
      const state = typeof err.details['state'] === 'string' ? err.details['state'] : null;
      setFailure(printerFailureText({ code: err.code, state, message: err.message }));
      await refreshTickets().catch(() => undefined);
    } else {
      setFailure(
        printerFailureText({ code: 'OTHER', state: null, message: (err as Error).message ?? '' }),
      );
    }
  };

  const ticket = currentTicket(tickets);
  const keys = doneKeys(ticket, busy);
  const stored =
    ticket?.printStatus === 'FAILED' && ticket.lastError
      ? printerFailureText(ticket.lastError)
      : null;

  const print = () =>
    run(async () => {
      setFailure(null);
      try {
        if (ticket) await api.printTicket(ticket.ticketId);
        else await api.createTicket(batchId);
        await refreshTickets();
      } catch (err) {
        await showPrintError(err);
      }
    });

  const reprint = () =>
    run(async () => {
      if (!ticket) return;
      setFailure(null);
      try {
        await api.reprintTicket(ticket.ticketId);
        await refreshTickets();
      } catch (err) {
        await showPrintError(err);
      }
    });

  const retryWriteBack = () =>
    run(async () => {
      setSending(true);
      try {
        const current = writeBack ?? summary?.writeBack ?? null;
        setWriteBack(
          current?.requested
            ? await api.retryWriteBack(batchId)
            : await api.postConsumption(batchId),
        );
      } catch {
        // The row keeps showing the last known state; Retry stays available.
      } finally {
        setSending(false);
      }
    });

  const reload = () => {
    setLoadFailed(false);
    setSending(true);
    setLoadId((n) => n + 1);
  };

  const latest = useRef({ print, onLeave, primary: keys.primaryEnabled, next: keys.nextEnabled });
  useEffect(() => {
    latest.current = { print, onLeave, primary: keys.primaryEnabled, next: keys.nextEnabled };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F1' && e.key !== 'F3') return;
      e.preventDefault();
      if (e.key === 'F1' && latest.current.primary) void latest.current.print();
      else if (e.key === 'F3' && latest.current.next) latest.current.onLeave();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <section className={styles.stage}>
      <div className={styles.msg}>
        <span className={styles.heading}>{t('done.title', { batchId })}</span>
        {summary ? (
          <SummaryPanel
            summary={summary}
            writeBack={writeBack ?? summary.writeBack}
            sending={sending}
            busy={busy}
            onRetry={() => void retryWriteBack()}
          />
        ) : loadFailed ? (
          <div className={styles.failure} role="alert">
            {t('done.loadFailed')}{' '}
            <button type="button" className={styles.small} onClick={reload}>
              {t('done.reload')}
            </button>
          </div>
        ) : (
          <p className={styles.note}>{t('done.loading')}</p>
        )}
        <p className={styles.note}>{t('done.note')}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.key} ${styles.ok}`}
            disabled={!keys.primaryEnabled}
            onClick={() => void print()}
          >
            {keys.primaryLabel}
            <span className={styles.fn}>F1</span>
          </button>
          {keys.reprintVisible && (
            <button
              type="button"
              className={styles.key}
              disabled={!keys.reprintEnabled}
              onClick={() => void reprint()}
            >
              {t('done.key.reprint')}
            </button>
          )}
          <button
            type="button"
            className={styles.key}
            disabled={!keys.nextEnabled}
            onClick={onLeave}
          >
            {t('done.key.next')}
            <span className={styles.fn}>F3</span>
          </button>
        </div>
      </div>
      <TicketPanel ticket={ticket} tickets={tickets} failure={failure ?? stored} />
    </section>
  );
}
