import type { SessionView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import styles from './WeighScreen.module.css';

interface Props {
  session: SessionView;
  onBack: () => void;
}

/** INTERIM (bolt 011): shown once the last component is confirmed; Confirm & print arrives in bolt 016. */
export function BatchWeighedNotice({ session, onBack }: Props) {
  return (
    <section className={styles.notice}>
      <div className={styles.big}>{t('weigh.weighed.title', { batchId: session.batchId })}</div>
      <div className={styles.sm}>{t('weigh.weighed.body', { total: session.componentCount })}</div>
      <button type="button" className={`${styles.key} ${styles.ok}`} onClick={onBack}>
        {t('weigh.weighed.back')}
      </button>
    </section>
  );
}
