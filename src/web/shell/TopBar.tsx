import type { OperatorView } from '../../shared/weighing';
import { t } from '../i18n/messages';
import styles from './TopBar.module.css';

export interface CrumbData {
  batchId: string;
  orderRef: string;
  machineRef: string;
}

interface Props {
  stationLabel: string;
  crumb: CrumbData | null;
  operator: OperatorView | null;
  onSignOut: () => void;
}

/** Prototype `.topbar`: brand, batch crumb, operator chip (+ Sign out, a UI addition). */
export function TopBar({ stationLabel, crumb, operator, onSignOut }: Props) {
  return (
    <header className={styles.topbar}>
      <span className={styles.brand}>
        <span className={styles.name}>{t('brand.name')}</span>
        <span className={styles.station}>{t('brand.station', { station: stationLabel })}</span>
      </span>
      {crumb && (
        <span className={styles.crumb} data-testid="crumb">
          {t('crumb.batch')} <b>{crumb.batchId}</b> · {t('crumb.order')} <b>{crumb.orderRef}</b> ·{' '}
          {t('crumb.machine')} <b>{crumb.machineRef}</b>
        </span>
      )}
      <span className={styles.spacer} />
      {operator && (
        <span className={styles.chip}>
          <span className={styles.dot} aria-hidden="true" />
          {t('operator.label')}&nbsp;<b>{operator.name}</b> · {operator.shift}
          <button type="button" className={styles.signOut} onClick={onSignOut}>
            {t('operator.signOut')}
          </button>
        </span>
      )}
    </header>
  );
}
