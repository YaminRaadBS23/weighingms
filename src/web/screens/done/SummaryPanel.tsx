import type { CompletionSummaryResponse, WriteBackView } from '../../../shared/completion';
import { qty } from '../../shared/format';
import { t } from '../../i18n/messages';
import { elapsedText, writeBackRow } from './done-model';
import styles from './ConfirmPrintScreen.module.css';

interface Props {
  summary: CompletionSummaryResponse;
  writeBack: WriteBackView | null;
  sending: boolean;
  busy: boolean;
  onRetry: () => void;
}

/** Prototype `.summary`: the numbers of the finished batch and the OrgaTEX write-back row. */
export function SummaryPanel({ summary, writeBack, sending, busy, onRetry }: Props) {
  const wb = writeBackRow(writeBack, sending);
  return (
    <div className={styles.summary} data-testid="summary">
      <Row label={t('done.sum.components')}>
        {t('done.sum.components.value', {
          done: summary.componentsWeighed,
          total: summary.componentsTotal,
        })}
      </Row>
      <Row label={t('done.sum.tolerance')} tone={summary.allWithinTolerance ? 'ok' : 'warn'}>
        {summary.allWithinTolerance ? t('done.sum.yes') : t('done.sum.no')}
      </Row>
      <Row label={t('done.sum.total')}>{qty(summary.totalDispensed)}</Row>
      <Row label={t('done.sum.elapsed')}>{elapsedText(summary.elapsedSeconds)}</Row>
      <Row label={t('done.sum.operator')}>{summary.operator.name}</Row>
      <Row label={t('done.sum.writeback')} tone={wb.tone} testId="writeback">
        {wb.text}
      </Row>
      {(wb.detail || wb.showRetry) && (
        <div className={styles.wbDetail} data-testid="writeback-detail">
          {wb.detail && <span>{wb.detail}</span>}
          {wb.attempts && <span className={styles.attempts}>{wb.attempts}</span>}
          {wb.showRetry && (
            <button type="button" className={styles.small} disabled={busy} onClick={onRetry}>
              {t('done.wb.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row(p: { label: string; tone?: 'ok' | 'warn'; testId?: string; children: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.k}>{p.label}</span>
      <span
        className={`${styles.v} ${p.tone === 'ok' ? styles.good : ''} ${p.tone === 'warn' ? styles.pending : ''}`}
        data-testid={p.testId}
      >
        {p.children}
      </span>
    </div>
  );
}
