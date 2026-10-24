import { useEffect, useRef } from 'react';
import { t } from '../../i18n/messages';
import styles from './WeighScreen.module.css';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

/** "Quit this batch?" — quitting suspends the session; Escape or Keep weighing returns. */
export function QuitDialog({ onConfirm, onCancel }: Props) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div
      className={styles.backdrop}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      role="presentation"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('weigh.quit.title')}
      >
        <div className={styles.big}>{t('weigh.quit.title')}</div>
        <div className={styles.sm}>{t('weigh.quit.body')}</div>
        <div className={styles.actions}>
          <button type="button" className={styles.key} onClick={onConfirm}>
            {t('weigh.quit.confirm')}
          </button>
          <button
            type="button"
            className={`${styles.key} ${styles.ok}`}
            ref={keep}
            onClick={onCancel}
          >
            {t('weigh.quit.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
