import { useState } from 'react';
import type { ScanEvent } from '../../../shared/peripherals';
import type { OperatorView } from '../../../shared/weighing';
import { api, ApiError } from '../../services/api-client';
import { t } from '../../i18n/messages';
import { ScanEntry } from '../../shared/ScanEntry';
import styles from './SignInScreen.module.css';

/** Sign-in by badge, scanned or typed (FR-1). Not in the prototype — a required UI addition. */
export function SignInScreen({ onSignedIn }: { onSignedIn: (op: OperatorView) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e: ScanEvent) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.signIn(e.code));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'OPERATOR_UNKNOWN'
          ? t('signIn.unknown')
          : t('error.generic', { message: err instanceof Error ? err.message : '' }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.signIn}>
      <div className={styles.prompt}>
        <div className={styles.beam} aria-hidden="true" />
        <div>
          <div className={styles.big}>{t('signIn.title')}</div>
          <div className={styles.sm}>{t('signIn.hint')}</div>
        </div>
      </div>
      <ScanEntry onCode={handle} example="BDG-nnnn" enabled={!busy} />
      <div className={styles.message} role="status" aria-live="polite">
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </section>
  );
}
