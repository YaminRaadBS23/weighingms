import type { Quantity } from '../../../shared/quantity';
import { formatValue } from '../../../shared/quantity';
import type { SessionComponentView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import styles from './WeighScreen.module.css';
import { remaining, shownWeight, zoneOf } from './weigh-model';

interface Props {
  component: SessionComponentView;
  /** The live net reading, or null while there is none (locked, scale offline). */
  weight: Quantity | null;
  /** The scale is lost: show that instead of a stale or zero value. */
  scaleLost?: boolean;
}

/** Weighed now / Still to weigh / Target, with the live value coloured by tolerance zone. */
export function Readout({ component: c, weight, scaleLost }: Props) {
  const unit = c.target.unit;
  return (
    <div className={styles.readout}>
      <div className={`${styles.cell} ${styles.live}`} data-zone={zoneOf(weight, c)}>
        <span className={styles.k}>{t('weigh.cell.now')}</span>
        <span className={styles.cv} data-testid="weight-now">
          {scaleLost ? (
            t('weigh.scale.lost')
          ) : (
            <>
              {shownWeight(weight, c)} <span className={styles.u}>{unit}</span>
            </>
          )}
        </span>
      </div>
      <div className={styles.cell}>
        <span className={styles.k}>{t('weigh.cell.left')}</span>
        <span className={styles.cv} data-testid="weight-left">
          {formatValue(remaining(weight, c))} <span className={styles.u}>{unit}</span>
        </span>
      </div>
      <div className={styles.cell}>
        <span className={styles.k}>{t('weigh.cell.target')}</span>
        <span className={styles.cv}>
          {formatValue(c.target)} <span className={styles.u}>{unit}</span>
        </span>
      </div>
    </div>
  );
}
