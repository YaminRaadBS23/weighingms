import { useCallback, useEffect, useRef, useState } from 'react';
import type { Quantity } from '../../../shared/quantity';
import type { ScanEvent } from '../../../shared/peripherals';
import type { ScaleSummary } from '../../../shared/scales';
import type { SessionView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import { api } from '../../services/api-client';
import { usePolling } from '../../shared/usePolling';
import { ActionKeys } from './ActionKeys';
import { BatchWeighedNotice } from './BatchWeighedNotice';
import { QuitDialog } from './QuitDialog';
import { Readout } from './Readout';
import { RecipeRail } from './RecipeRail';
import { ScanPrompt } from './ScanPrompt';
import { ToleranceBar } from './ToleranceBar';
import { WeighHeader } from './WeighHeader';
import styles from './WeighScreen.module.css';
import { errorText, okKeyState, zoneOf } from './weigh-model';

export const WEIGHT_POLL_MS = 100;
export const SLOW_POLL_MS = 2000;

interface Reading {
  sequence: number;
  scaleId: string;
  weight: Quantity;
  stable: boolean;
}

interface Props {
  session: SessionView;
  /** A fresher view of the session came back from the API. */
  onSession: (session: SessionView) => void;
  /** The session was quit, or the finished batch was acknowledged: back to Select batch. */
  onLeave: () => void;
}

/**
 * 2 · Weigh (prototype `#v-weigh`). The live reading comes from `GET /api/scales/:id/weight`
 * (10 Hz, only while the component is unlocked); every decision that matters is made again by
 * the server on OK (ADR-7), so this screen only displays and requests.
 */
export function WeighScreen({ session, onSession, onLeave }: Props) {
  const [scales, setScales] = useState<ScaleSummary[]>([]);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quitting, setQuitting] = useState(false);
  // Bumped by every operator action so a poll that started earlier cannot overwrite its result.
  const epoch = useRef(0);

  const active = session.components.find((c) => c.state === 'ACTIVE') ?? null;
  const prep = active?.preparation ?? null;
  const unlocked = prep?.state === 'UNLOCKED';
  const scaleId = active?.scale?.scaleId ?? null;
  const scale = scales.find((s) => s.scaleId === scaleId) ?? null;
  const live = session.status === 'IN_PROGRESS';
  const sequence = active?.sequence ?? null;

  usePolling(async () => {
    try {
      setScales((await api.scales()).items);
    } catch {
      // The status strip reports connectivity; keep the last known scales.
    }
  }, SLOW_POLL_MS);

  usePolling(
    async () => {
      const started = epoch.current;
      try {
        const next = await api.session(session.sessionId);
        if (epoch.current === started) onSession(next);
      } catch {
        // A failed refresh keeps the screen as it is.
      }
    },
    SLOW_POLL_MS,
    live,
  );

  usePolling(
    async () => {
      if (!scaleId) return;
      const started = epoch.current;
      try {
        const w = await api.weight(scaleId);
        if (epoch.current === started && sequence !== null) {
          setReading({ sequence, scaleId, weight: w.weight, stable: w.stable });
        }
      } catch {
        setReading(null);
      }
    },
    WEIGHT_POLL_MS,
    live && unlocked && scaleId !== null,
  );

  const run = useCallback(
    async (action: () => Promise<SessionView>) => {
      epoch.current += 1;
      setBusy(true);
      setError(null);
      try {
        const next = await action();
        epoch.current += 1;
        onSession(next);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(false);
      }
    },
    [onSession],
  );

  // A reading belongs to one component on one scale; anything else is stale.
  const current =
    unlocked && reading?.scaleId === scaleId && reading?.sequence === sequence ? reading : null;
  const weight = current?.weight ?? null;
  const ok = okKeyState({
    unlocked,
    stable: current ? current.stable : null,
    scaleReady: scale?.state === 'READY',
    zone: active ? zoneOf(weight, active) : 'UNDER',
  });

  const confirm = () => {
    if (!active || !ok.enabled) return;
    void run(async () => (await api.confirm(session.sessionId, active.sequence)).session);
  };
  const retare = () => {
    if (active && unlocked) void run(() => api.retare(session.sessionId, active.sequence));
  };
  const quit = async () => {
    setQuitting(false);
    try {
      await api.quit(session.sessionId);
      onLeave();
    } catch (err) {
      setError(errorText(err));
    }
  };
  const touchPending = (seq: number) => void run(() => api.activate(session.sessionId, seq));

  const onCode = (e: ScanEvent) => {
    if (!active) return;
    const call =
      e.kind === 'DYESTUFF'
        ? api.verifyIdentity
        : e.kind === 'LOT'
          ? api.setLot
          : e.kind === 'CONTAINER'
            ? api.setContainer
            : null;
    if (!call) {
      setError(t('weigh.scan.wrongKind', { code: e.code }));
      return;
    }
    void run(() => call(session.sessionId, active.sequence, e.code));
  };

  // Function keys of the station keyboard mirror the on-screen keys.
  const keys = useRef({ confirm, retare });
  useEffect(() => {
    keys.current = { confirm, retare };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F1' && e.key !== 'F2' && e.key !== 'F4') return;
      e.preventDefault();
      if (e.key === 'F1') keys.current.confirm();
      else if (e.key === 'F2') keys.current.retare();
      else setQuitting(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (session.status === 'COMPLETED')
    return <BatchWeighedNotice session={session} onBack={onLeave} />;

  return (
    <div className={styles.stage}>
      <RecipeRail session={session} disabled={busy || !live} onTouch={touchPending} />
      {active && (
        <section className={styles.weigh}>
          <WeighHeader component={active} scale={scale} />
          {!unlocked && <ScanPrompt component={active} onCode={onCode} error={error} busy={busy} />}
          <Readout component={active} weight={weight} />
          <ToleranceBar
            component={active}
            weight={weight}
            lockedText={
              !unlocked
                ? t('weigh.status.locked')
                : weight === null
                  ? t('weigh.status.noReading')
                  : undefined
            }
          />
          {unlocked && error && (
            <div className={styles.issue} role="alert">
              {error}
            </div>
          )}
          <ActionKeys
            okEnabled={ok.enabled}
            okReason={ok.reason}
            retareEnabled={unlocked}
            busy={busy}
            onOk={confirm}
            onRetare={retare}
            onQuit={() => setQuitting(true)}
          />
        </section>
      )}
      {quitting && <QuitDialog onConfirm={() => void quit()} onCancel={() => setQuitting(false)} />}
    </div>
  );
}
