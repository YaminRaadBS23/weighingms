import { t } from '../../i18n/messages';
import styles from './WeighScreen.module.css';
import type { SurplusView } from './weigh-model';

interface Props {
  surplus: SurplusView;
}

/** What went over and how to recover; the surplus is measured from the target. */
export function SurplusPanel({ surplus }: Props) {
  return (
    <div className={styles.surplus} role="status" data-testid="surplus-panel">
      <div className={styles.surplusTitle}>
        {t('weigh.surplus.title', {
          amount: surplus.amount,
          unit: surplus.unit,
          percent: surplus.percent,
        })}
      </div>
      <div className={styles.sm}>{t('weigh.surplus.actions')}</div>
    </div>
  );
}
