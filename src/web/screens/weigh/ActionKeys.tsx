import { t, type MessageKey } from '../../i18n/messages';
import styles from './WeighScreen.module.css';

interface Props {
  okEnabled: boolean;
  /** Why OK is off (shown beside the keys); null when it is on. */
  okReason: MessageKey | null;
  retareEnabled: boolean;
  busy: boolean;
  onOk: () => void;
  onRetare: () => void;
  onQuit: () => void;
}

/** OK · Confirm (F1), Re-tare (F2) and Quit (F4): the three large touch keys. */
export function ActionKeys(p: Props) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={`${styles.key} ${styles.ok}`}
        disabled={!p.okEnabled || p.busy}
        onClick={p.onOk}
      >
        {t('weigh.key.ok')}
        <span className={styles.fn}>F1</span>
      </button>
      <button
        type="button"
        className={styles.key}
        disabled={!p.retareEnabled || p.busy}
        onClick={p.onRetare}
      >
        {t('weigh.key.retare')}
        <span className={styles.fn}>F2</span>
      </button>
      <button type="button" className={`${styles.key} ${styles.ghost}`} onClick={p.onQuit}>
        {t('weigh.key.quit')}
        <span className={styles.fn}>F4</span>
      </button>
      {p.okReason && (
        <span className={styles.reason} data-testid="ok-reason">
          {t(p.okReason)}
        </span>
      )}
    </div>
  );
}
