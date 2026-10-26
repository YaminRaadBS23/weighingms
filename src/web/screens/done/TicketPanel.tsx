import type { TicketView } from '../../../shared/ticket';
import { t } from '../../i18n/messages';
import { hhmm } from '../../shared/format';
import { printedCopies, svgDataUrl } from './done-model';
import styles from './ConfirmPrintScreen.module.css';

interface Props {
  ticket: TicketView | null;
  tickets: readonly TicketView[];
  /** Operator wording for a refused print of the current ticket, or null. */
  failure: string | null;
}

/**
 * Prototype `.ticket`: the stored ticket exactly as printed (the server's lines) with the
 * Code 128 barcode as an image. Nothing is composed here.
 */
export function TicketPanel({ ticket, tickets, failure }: Props) {
  if (!ticket) {
    return (
      <div>
        <p className={styles.ticketEmpty} data-testid="ticket-empty">
          {t('done.ticket.empty')}
        </p>
        {failure && (
          <p className={styles.failure} role="alert">
            {failure}
          </p>
        )}
      </div>
    );
  }
  const { preview } = ticket;
  const copies = printedCopies(tickets);
  return (
    <div>
      <div className={styles.ticket} data-testid="ticket">
        <pre className={styles.lines}>{preview.lines.join('\n')}</pre>
        <img
          className={styles.barcode}
          src={svgDataUrl(preview.barcode.svg)}
          alt={t('done.ticket.barcodeAlt', { value: preview.barcode.value })}
        />
        <div className={styles.barcodeText}>{preview.barcode.value}</div>
      </div>
      <p className={styles.ticketStatus} data-testid="ticket-status">
        {ticket.printStatus === 'PRINTED' && ticket.printedAt
          ? t('done.ticket.printed', { time: hhmm(ticket.printedAt) })
          : t('done.ticket.notPrinted')}
        {copies > 0 && <span> · {t('done.ticket.copies', { n: copies })}</span>}
      </p>
      {failure && (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      )}
      <p className={styles.label}>{t('done.ticket.label')}</p>
    </div>
  );
}
