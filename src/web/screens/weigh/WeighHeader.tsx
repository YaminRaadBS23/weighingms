import type { ScaleSummary } from '../../../shared/scales';
import type { SessionComponentView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import { capacity, qty } from '../../shared/format';
import styles from './WeighScreen.module.css';

interface Props {
  component: SessionComponentView;
  scale: ScaleSummary | null;
}

/** Active component name, its "code · LOT · CONTAINER · TARE" line and the selected-scale badge. */
export function WeighHeader({ component: c, scale }: Props) {
  const prep = c.preparation;
  const meta =
    prep?.lot && prep.container
      ? t('weigh.meta', {
          code: c.dyestuff.code,
          lot: prep.lot.lotId,
          container: prep.container.containerId,
          tare: qty(prep.container.tare),
        })
      : t('weigh.meta.prepare', { code: c.dyestuff.code });
  return (
    <div className={styles.weighHead}>
      <div className={styles.who}>
        <span className={styles.whoName}>{c.dyestuff.name}</span>
        <span className={styles.meta}>{meta}</span>
      </div>
      <div className={styles.scaleBadge}>
        <span className={styles.k}>{t('weigh.scaleSelected')}</span>
        <span className={styles.sv}>
          {scale
            ? t(`weigh.scaleBadge.${scale.class}`, { capacity: capacity(scale.capacity) })
            : t('weigh.scaleBadge.none')}
        </span>
        <span className={styles.auto}>
          {c.scale?.mode === 'MANUAL' ? t('weigh.scaleSupervisor') : t('weigh.scaleAuto')}
        </span>
      </div>
    </div>
  );
}
