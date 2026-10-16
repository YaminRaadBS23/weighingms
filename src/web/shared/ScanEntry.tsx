import { useState, type FormEvent } from 'react';
import type { ScanEvent } from '../../shared/peripherals';
import { api, ApiError } from '../services/api-client';
import { t } from '../i18n/messages';
import styles from './ScanEntry.module.css';
import { useScanFeed } from './useScanFeed';

interface Props {
  /** Called once per scanned or typed code (same classified event shape). */
  onCode: (e: ScanEvent) => void;
  /** Format hint shown in the empty field, e.g. "BDG-nnnn". */
  example: string;
  /** Listen to the scanner while true (default). */
  enabled?: boolean;
}

/**
 * Accepts codes from the barcode scanner (scan feed) and from the keyboard (typed entry).
 * Both reach `onCode` through the same API classification (FR-34).
 */
export function ScanEntry({ onCode, example, enabled = true }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  useScanFeed(onCode, enabled);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    try {
      setError(null);
      onCode(await api.manualCode(value));
      setValue('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.network'));
    }
  };

  return (
    <form className={styles.entry} onSubmit={submit}>
      <label className={styles.label} htmlFor="scan-entry">
        {t('scan.typedLabel')}
      </label>
      <input
        id="scan-entry"
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('scan.placeholder', { example })}
        autoComplete="off"
        spellCheck={false}
        disabled={!enabled}
      />
      <button type="submit" className={styles.key} disabled={!enabled || !value.trim()}>
        {t('scan.submit')}
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
