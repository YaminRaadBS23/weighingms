import { formatValue, type Quantity } from '../../../shared/quantity';
import type { SessionComponentView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import styles from './WeighScreen.module.css';
import { bandCaption, barGeometry, statusText, zoneOf } from './weigh-model';

interface Props {
  component: SessionComponentView;
  weight: Quantity | null;
  /** Shown instead of the zone text while there is nothing to weigh yet. */
  lockedText?: string;
}

/** Progress bar with the tolerance band and target line, its caption and the status line. */
export function ToleranceBar({ component: c, weight, lockedText }: Props) {
  const zone = zoneOf(weight, c);
  const g = barGeometry(weight, c);
  return (
    <div className={styles.barBlock}>
      <div
        className={styles.bar}
        data-zone={zone}
        role="progressbar"
        aria-label={t('weigh.bar.label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(g.fill)}
      >
        <div className={styles.fill} style={{ width: `${g.fill}%` }} />
        <div className={styles.band} style={{ left: `${g.bandLeft}%`, width: `${g.bandWidth}%` }} />
        <div className={styles.targetLine} style={{ left: `${g.targetLeft}%` }} />
      </div>
      <div className={styles.barCaption}>
        <span>0</span>
        <span>{bandCaption(c)}</span>
        <span>{`${formatValue(c.barMax)} ${c.barMax.unit}`}</span>
      </div>
      <div className={styles.statusLine} data-zone={zone} role="status">
        {lockedText ?? statusText(weight, c)}
      </div>
    </div>
  );
}
