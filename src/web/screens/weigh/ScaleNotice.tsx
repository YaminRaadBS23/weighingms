import { t } from '../../i18n/messages';
import styles from './WeighScreen.module.css';
import type { ScaleCondition } from './weigh-model';

interface Props {
  condition: ScaleCondition;
}

/** Banner for a lost scale, a scale that came back (re-tare needed) or expired calibration. */
export function ScaleNotice({ condition }: Props) {
  if (condition === 'OK') return null;
  const text =
    condition === 'LOST'
      ? t('weigh.scale.lostNotice')
      : condition === 'RECONNECTED'
        ? t('weigh.scale.backNotice')
        : t('weigh.scale.expiredNotice');
  return (
    <div className={styles.scaleNotice} data-condition={condition} role="alert">
      {text}
    </div>
  );
}
