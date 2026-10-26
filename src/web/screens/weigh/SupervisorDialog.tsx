import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatValue } from '../../../shared/quantity';
import type { ScaleOptionView, SessionComponentView, SessionView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import { api } from '../../services/api-client';
import styles from './WeighScreen.module.css';
import { errorText } from './weigh-model';

export const REASON_MAX = 500;

export type SupervisorMode = 'OVERRIDE' | 'SCALE';

interface Props {
  mode: SupervisorMode;
  sessionId: string;
  component: SessionComponentView;
  /** The authorised action succeeded; the caller applies the returned session. */
  onDone: (session: SessionView) => void;
  onCancel: () => void;
}

/**
 * Supervisor authorisation in a dialog: badge, masked PIN and (for an override) a mandatory
 * reason, or (for a scale change) a choice among the scales that fit. The browser sends no
 * weight: the server reads the scale itself (ADR-7). The PIN is cleared after every attempt.
 */
export function SupervisorDialog({ mode, sessionId, component, onDone, onCancel }: Props) {
  const [badge, setBadge] = useState('');
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [scaleId, setScaleId] = useState<string | null>(null);
  const [options, setOptions] = useState<ScaleOptionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), [options]);

  useEffect(() => {
    if (mode !== 'SCALE') return;
    let live = true;
    api
      .scaleOptions(sessionId, component.sequence)
      .then((r) => live && setOptions(r.items.filter((o) => o.fits)))
      .catch((err) => live && (setError(errorText(err)), setOptions([])));
    return () => {
      live = false;
    };
  }, [mode, sessionId, component.sequence]);

  const ready =
    badge.trim() !== '' &&
    pin !== '' &&
    (mode === 'OVERRIDE' ? reason.trim() !== '' : scaleId !== null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const supervisorBadge = badge.trim();
      if (mode === 'OVERRIDE') {
        const r = await api.override(sessionId, component.sequence, {
          supervisorBadge,
          pin,
          reason: reason.trim(),
        });
        onDone(r.session);
      } else {
        onDone(
          await api.reselectScale(sessionId, component.sequence, {
            scaleId: scaleId as string,
            supervisorBadge,
            pin,
          }),
        );
      }
    } catch (err) {
      setError(errorText(err));
      setPin('');
      setBusy(false);
    }
  };

  const title = mode === 'OVERRIDE' ? t('weigh.sup.overrideTitle') : t('weigh.sup.scaleTitle');
  const requirement = `${formatValue(component.target)} ${component.target.unit}`;
  return (
    <div
      className={styles.backdrop}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      role="presentation"
    >
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => void submit(e)}
      >
        <div className={styles.big}>{title}</div>
        {mode === 'OVERRIDE' && (
          <div className={styles.awaiting}>{t('weigh.status.overrideRequested')}</div>
        )}
        <div className={styles.sm}>
          {mode === 'OVERRIDE'
            ? t('weigh.sup.overrideBody', { dyestuff: component.dyestuff.name })
            : t('weigh.sup.scaleBody', { requirement })}
        </div>
        {mode === 'SCALE' && (
          <div className={styles.scaleChoices} role="radiogroup" aria-label={title}>
            {options === null && <div className={styles.sm}>{t('weigh.sup.loading')}</div>}
            {options?.length === 0 && <div className={styles.sm}>{t('weigh.sup.noOptions')}</div>}
            {options?.map((o) => (
              <label key={o.scaleId} className={styles.choice} data-usable={o.usable}>
                <input
                  type="radio"
                  name="scale"
                  disabled={!o.usable || o.selected}
                  checked={scaleId === o.scaleId}
                  onChange={() => setScaleId(o.scaleId)}
                />
                <span>
                  {o.scaleId} · {formatValue(o.capacity)} {o.capacity.unit}
                  {o.selected
                    ? ` · ${t('weigh.sup.optionSelected')}`
                    : o.usable
                      ? ''
                      : ` · ${o.state}`}
                </span>
              </label>
            ))}
          </div>
        )}
        <label className={styles.field}>
          <span>{t('weigh.sup.badge')}</span>
          <input
            ref={first}
            type="text"
            value={badge}
            autoComplete="off"
            onChange={(e) => setBadge(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>{t('weigh.sup.pin')}</span>
          <input
            type="password"
            value={pin}
            autoComplete="off"
            inputMode="numeric"
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        {mode === 'OVERRIDE' && (
          <label className={styles.field}>
            <span>
              {t('weigh.sup.reason')}{' '}
              <span className={styles.count}>
                {t('weigh.sup.reasonCount', { used: reason.length, max: REASON_MAX })}
              </span>
            </span>
            <textarea
              rows={3}
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {error && (
          <div className={styles.issue} role="alert">
            {error}
          </div>
        )}
        <div className={styles.actions}>
          <button type="submit" className={`${styles.key} ${styles.ok}`} disabled={!ready || busy}>
            {mode === 'OVERRIDE' ? t('weigh.sup.submit') : t('weigh.sup.useScale')}
          </button>
          <button type="button" className={styles.key} onClick={onCancel}>
            {t('weigh.sup.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
