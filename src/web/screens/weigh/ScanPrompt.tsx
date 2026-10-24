import type { ScanEvent } from '../../../shared/peripherals';
import type { SessionComponentView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import { ScanEntry } from '../../shared/ScanEntry';
import styles from './WeighScreen.module.css';

interface Props {
  component: SessionComponentView;
  onCode: (e: ScanEvent) => void;
  /** Error from the last scan or from the preparation (wrong dyestuff, unknown container, …). */
  error: string | null;
  busy: boolean;
}

/** What the operator must scan next on a locked component: dyestuff, lot, container, then tare. */
export function ScanPrompt({ component: c, onCode, error, busy }: Props) {
  const prep = c.preparation;
  let title = t('weigh.scan.identity', { code: c.dyestuff.code });
  let hint = t('weigh.scan.identityHint');
  let example = 'DYE-nnnn';
  if (c.scale && c.scale.scaleId === null) {
    title = t('weigh.scan.noScale');
    hint = '';
  } else if (prep?.state === 'AWAITING_MATERIAL') {
    if (!prep.lot) {
      title = t('weigh.scan.lot');
      example = 'nnnn-nnnn';
    } else {
      title = t('weigh.scan.container');
      example = 'C-nn';
    }
    hint = c.suggestedLotId ? t('weigh.scan.materialHint', { lot: c.suggestedLotId }) : '';
  } else if (prep?.state === 'AWAITING_TARE') {
    title = t('weigh.scan.tare');
    hint = '';
  }
  const shown = error ?? prep?.issue?.message ?? null;
  return (
    <>
      <div className={styles.scanPrompt}>
        <div className={styles.beam} aria-hidden="true" />
        <div>
          <div className={styles.big}>{title}</div>
          {hint && <div className={styles.sm}>{hint}</div>}
        </div>
      </div>
      <ScanEntry onCode={onCode} example={example} enabled={!busy} />
      <div className={styles.issue} role="alert">
        {shown}
      </div>
    </>
  );
}
