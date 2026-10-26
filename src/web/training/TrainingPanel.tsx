import { useState } from 'react';
import type { ScannerState } from '../../shared/peripherals';
import type { PrinterState } from '../../shared/peripherals';
import type { Quantity, Unit } from '../../shared/quantity';
import type { ScaleSummary } from '../../shared/scales';
import type { SessionView } from '../../shared/weighing';
import { t, type MessageKey } from '../i18n/messages';
import { api } from '../services/api-client';
import { qty } from '../shared/format';
import { usePolling } from '../shared/usePolling';
import {
  sim,
  type Availability,
  type PrinterSimState,
  type SimOrgatex,
  type SimScale,
} from './sim-client';
import { activeTarget, landingWeight, parseWeight } from './training-model';
import styles from './TrainingPanel.module.css';

const REFRESH_MS = 2000;
const PRINTER_STATES: PrinterSimState[] = ['READY', 'OFFLINE', 'OUT_OF_PAPER'];

interface Snapshot {
  scales: ScaleSummary[];
  simScales: SimScale[];
  session: SessionView | null;
  orgatex: SimOrgatex | null;
  scanner: ScannerState | null;
  printer: PrinterState | null;
}

const EMPTY: Snapshot = {
  scales: [],
  simScales: [],
  session: null,
  orgatex: null,
  scanner: null,
  printer: null,
};

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * The Training Panel (story 012): a separate page for the trainer. Every control posts to one
 * `_sim` route; the operator screen reflects the result only through the normal APIs. It renders
 * no control unless the server has simulation enabled.
 */
export function TrainingPanel() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [scaleId, setScaleId] = useState('');
  const [exact, setExact] = useState({ value: '', unit: 'g' as Unit });
  const [container, setContainer] = useState({ value: '', unit: 'g' as Unit });
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    const found = availability ?? (await sim.availability());
    if (availability === null) setAvailability(found);
    if (found !== 'AVAILABLE') return;
    const [scales, session, simState, orgatex, scanner, printer] = await Promise.all([
      settle(api.scales()),
      settle(api.currentSession()),
      settle(sim.scaleState()),
      settle(sim.orgatexState()),
      settle(api.scannerStatus()),
      settle(api.printerStatus()),
    ]);
    setSnap({
      scales: scales?.items ?? [],
      simScales: simState?.scales ?? [],
      session: session?.session ?? null,
      orgatex,
      scanner: scanner?.state ?? null,
      printer: printer?.state ?? null,
    });
  };
  usePolling(refresh, REFRESH_MS);

  const active = activeTarget(snap.session);
  // Aim at the scale of the active component unless the trainer picked another one.
  const chosen = scaleId || active?.scaleId || snap.scales[0]?.scaleId || '';

  /** Runs one control, reports the outcome in words and refreshes the state block. */
  const act = async (action: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setMessage(t('training.done', { action }));
    } catch (err) {
      setMessage(t('training.failed', { action, message: (err as Error).message }));
    }
    await refresh();
  };

  const needScale = (fn: (id: string) => Promise<unknown>) => () =>
    chosen ? fn(chosen) : Promise.reject(new Error(t('training.noScale')));

  const withWeight = (
    input: { value: string; unit: Unit },
    fn: (id: string, q: Quantity) => Promise<unknown>,
  ) =>
    needScale((id) => {
      const q = parseWeight(input.value, input.unit);
      return q ? fn(id, q) : Promise.reject(new Error(t('training.invalidWeight')));
    });

  const land = (kind: 'EXACT' | 'OVER') =>
    needScale((id) =>
      active
        ? sim.dispense(id, landingWeight(kind, active))
        : Promise.reject(new Error(t('training.noActive'))),
    );

  const resetAll = async () => {
    await act(t('training.reset'), async () => {
      await Promise.all([
        sim.resetScales(),
        sim.scanner('reset'),
        sim.resetPrinter(),
        sim.orgatex('reset'),
      ]);
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('training.title')}</h1>
        <p className={styles.banner}>{t('training.banner')}</p>
      </header>

      {availability === null && <p>{t('training.checking')}</p>}
      {availability === 'DISABLED' && <p role="alert">{t('training.disabled')}</p>}
      {availability === 'UNREACHABLE' && <p role="alert">{t('training.unreachable')}</p>}

      {availability === 'AVAILABLE' && (
        <>
          <section className={styles.panel} aria-label={t('training.state')}>
            <h2>{t('training.state')}</h2>
            <ul className={styles.state}>
              {snap.simScales.map((s) => {
                const info = snap.scales.find((x) => x.scaleId === s.scaleId);
                return (
                  <li key={s.scaleId}>
                    {t('training.state.scale', {
                      scale: s.scaleId,
                      state: info ? info.state : s.connected ? 'READY' : 'OFFLINE',
                      reading: s.reading ? qty(s.reading.net) : t('training.state.noReading'),
                    })}
                  </li>
                );
              })}
              <li>
                {t('training.state.orgatex', {
                  state: snap.orgatex?.online ? 'ONLINE' : 'OFFLINE',
                  postings: snap.orgatex?.postings ?? 0,
                })}
              </li>
              <li>{t('training.state.scanner', { state: snap.scanner ?? '—' })}</li>
              <li>{t('training.state.printer', { state: snap.printer ?? '—' })}</li>
              <li>
                {active
                  ? t('training.state.active', {
                      name: active.name,
                      scale: active.scaleId ?? '—',
                      target: qty(active.target),
                    })
                  : t('training.state.noActive')}
              </li>
            </ul>
          </section>

          <section className={styles.panel} aria-label={t('training.scale')}>
            <h2>{t('training.scale')}</h2>
            <label className={styles.field}>
              {t('training.scale.pick')}
              <select value={chosen} onChange={(e) => setScaleId(e.target.value)}>
                {snap.scales.map((s) => (
                  <option key={s.scaleId} value={s.scaleId}>
                    {s.scaleId}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => void act(t('training.dispense'), land('EXACT'))}
              >
                {t('training.dispense')}
              </button>
              <button type="button" onClick={() => void act(t('training.overshoot'), land('OVER'))}>
                {t('training.overshoot')}
              </button>
            </div>
            <WeightControl
              legend={t('training.exact')}
              action={t('training.set')}
              input={exact}
              onChange={setExact}
              onSubmit={() =>
                void act(
                  t('training.exact'),
                  withWeight(exact, (id, q) => sim.setWeight(id, q)),
                )
              }
            />
            <WeightControl
              legend={t('training.container')}
              action={t('training.place')}
              input={container}
              onChange={setContainer}
              onSubmit={() =>
                void act(
                  t('training.container'),
                  withWeight(container, (id, q) => sim.placeContainer(id, q)),
                )
              }
            />
            <div className={styles.row}>
              <button
                type="button"
                onClick={() => void act(t('training.disconnect'), needScale(sim.disconnect))}
              >
                {t('training.disconnect')}
              </button>
              <button
                type="button"
                onClick={() => void act(t('training.reconnect'), needScale(sim.reconnect))}
              >
                {t('training.reconnect')}
              </button>
              <button
                type="button"
                onClick={() =>
                  void act(
                    t('training.expire'),
                    needScale((id) => sim.calibration(id, true)),
                  )
                }
              >
                {t('training.expire')}
              </button>
              <button
                type="button"
                onClick={() =>
                  void act(
                    t('training.restore'),
                    needScale((id) => sim.calibration(id, false)),
                  )
                }
              >
                {t('training.restore')}
              </button>
            </div>
          </section>

          <section className={styles.panel} aria-label={t('training.devices')}>
            <h2>{t('training.devices')}</h2>
            <div className={styles.row}>
              <button
                type="button"
                onClick={() =>
                  void act(t('training.scanner.offline'), () => sim.scanner('offline'))
                }
              >
                {t('training.scanner.offline')}
              </button>
              <button
                type="button"
                onClick={() => void act(t('training.scanner.online'), () => sim.scanner('online'))}
              >
                {t('training.scanner.online')}
              </button>
              <label className={styles.field}>
                {t('training.scan.code')}
                <input value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <button
                type="button"
                disabled={code.trim() === ''}
                onClick={() => void act(t('training.scan'), () => sim.scan(code.trim()))}
              >
                {t('training.scan.send')}
              </button>
            </div>
            <div className={styles.row}>
              {PRINTER_STATES.map((state) => {
                const label = t(`training.printer.${state}` as MessageKey);
                return (
                  <button
                    key={state}
                    type="button"
                    onClick={() => void act(label, () => sim.printer(state))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className={styles.row}>
              <button
                type="button"
                onClick={() =>
                  void act(t('training.orgatex.offline'), () => sim.orgatex('offline'))
                }
              >
                {t('training.orgatex.offline')}
              </button>
              <button
                type="button"
                onClick={() => void act(t('training.orgatex.online'), () => sim.orgatex('online'))}
              >
                {t('training.orgatex.online')}
              </button>
            </div>
          </section>

          <section className={styles.panel}>
            <button type="button" className={styles.danger} onClick={() => void resetAll()}>
              {t('training.reset')}
            </button>
            <p className={styles.note}>{t('training.reset.note')}</p>
          </section>

          <p className={styles.message} role="status">
            {message}
          </p>
        </>
      )}
    </div>
  );
}

function WeightControl(p: {
  legend: string;
  action: string;
  input: { value: string; unit: Unit };
  onChange: (next: { value: string; unit: Unit }) => void;
  onSubmit: () => void;
}) {
  return (
    <fieldset className={styles.weight}>
      <legend>{p.legend}</legend>
      <label className={styles.field}>
        {t('training.value')}
        <input
          inputMode="decimal"
          value={p.input.value}
          onChange={(e) => p.onChange({ ...p.input, value: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        {t('training.unit')}
        <select
          value={p.input.unit}
          onChange={(e) => p.onChange({ ...p.input, unit: e.target.value as Unit })}
        >
          <option value="g">g</option>
          <option value="kg">kg</option>
        </select>
      </label>
      <button type="button" onClick={p.onSubmit}>
        {p.action}
      </button>
    </fieldset>
  );
}
