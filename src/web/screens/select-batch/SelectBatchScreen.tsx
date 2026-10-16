import { useCallback, useEffect, useState } from 'react';
import type { BatchQueueResponse, BatchSummary } from '../../../shared/batches';
import type { ScanEvent } from '../../../shared/peripherals';
import type { SessionView } from '../../../shared/weighing';
import { api, ApiError } from '../../services/api-client';
import { t } from '../../i18n/messages';
import { hhmm } from '../../shared/format';
import { ScanEntry } from '../../shared/ScanEntry';
import { BatchQueueTable } from './BatchQueueTable';
import styles from './SelectBatch.module.css';

type QueueState =
  | { kind: 'loading' }
  | { kind: 'orgatexDown' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; queue: BatchQueueResponse };

interface Props {
  onSessionStarted: (session: SessionView, batch: BatchSummary) => void;
}

/**
 * 1 · Select batch (prototype `#v-queue`). Queue from `GET /api/batches`; selecting a batch calls
 * `GET /api/batches/:id`, then `GET /api/batches/:id/recipe`, then starts the session (Step 19).
 */
export function SelectBatchScreen({ onSessionStarted }: Props) {
  const [queue, setQueue] = useState<QueueState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const fetchQueue = useCallback(async (): Promise<QueueState> => {
    try {
      return { kind: 'ready', queue: await api.batches() };
    } catch (err) {
      return err instanceof ApiError && err.code === 'ORGATEX_UNAVAILABLE'
        ? { kind: 'orgatexDown' }
        : { kind: 'error', message: err instanceof Error ? err.message : '' };
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchQueue().then((next) => {
      if (active) setQueue(next);
    });
    return () => {
      active = false;
    };
  }, [fetchQueue]);

  const retry = async () => {
    setQueue({ kind: 'loading' });
    setMessage(null);
    setQueue(await fetchQueue());
  };

  const select = async (batchId: string) => {
    if (busy) return;
    setBusy(true);
    setSelectedId(batchId);
    setMessage({ text: t('queue.selecting', { batchId }), tone: 'info' });
    try {
      const batch = await api.batch(batchId);
      if (!batch.selectable) {
        setMessage({
          text: t('queue.notSelectable', { batchId: batch.batchId, reason: batch.reason ?? '' }),
          tone: 'error',
        });
        return;
      }
      await api.recipe(batch.batchId);
      const session = await api.startSession(batch.batchId);
      onSessionStarted(session, batch);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORGATEX_UNAVAILABLE') {
        setQueue({ kind: 'orgatexDown' });
        setMessage(null);
      } else {
        setMessage({
          text: err instanceof Error ? err.message : t('error.network'),
          tone: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const onRowTouch = (b: BatchSummary) => {
    if (!b.selectable) {
      setSelectedId(b.batchId);
      setMessage({
        text: t('queue.notSelectable', { batchId: b.batchId, reason: b.reason ?? '' }),
        tone: 'error',
      });
      return;
    }
    void select(b.batchId);
  };

  const onCode = (e: ScanEvent) => {
    if (e.kind !== 'BATCH') {
      setMessage({ text: t('queue.notABatch', { code: e.code }), tone: 'error' });
      return;
    }
    void select(e.code);
  };

  return (
    <section className={styles.queue}>
      <div className={styles.scanPrompt}>
        <div className={styles.beam} aria-hidden="true" />
        <div>
          <div className={styles.big}>{t('queue.scanTitle')}</div>
          {queue.kind === 'ready' && (
            <div className={styles.sm}>
              {t('queue.scanHint', { time: hhmm(queue.queue.receivedAt) })}
            </div>
          )}
        </div>
      </div>

      <ScanEntry onCode={onCode} example="B-nnnnn" enabled={!busy} />

      <div className={styles.message} role="status" aria-live="polite">
        {message && (
          <span className={message.tone === 'error' ? styles.error : styles.info}>
            {message.text}
          </span>
        )}
      </div>

      {queue.kind === 'loading' && <p className={styles.sm}>{t('queue.loading')}</p>}

      {queue.kind === 'orgatexDown' && (
        <div className={styles.down} role="alert">
          <div className={styles.big}>{t('queue.orgatexDown')}</div>
          <div className={styles.sm}>{t('queue.orgatexDownHint')}</div>
          <button type="button" className={styles.key} onClick={() => void retry()}>
            {t('queue.retry')}
          </button>
        </div>
      )}

      {queue.kind === 'error' && (
        <div className={styles.down} role="alert">
          <div className={styles.sm}>{t('error.generic', { message: queue.message })}</div>
          <button type="button" className={styles.key} onClick={() => void retry()}>
            {t('queue.retry')}
          </button>
        </div>
      )}

      {queue.kind === 'ready' &&
        (queue.queue.items.length === 0 ? (
          <p className={styles.sm}>{t('queue.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <BatchQueueTable
              items={queue.queue.items}
              selectedId={selectedId}
              onRowTouch={onRowTouch}
            />
          </div>
        ))}
    </section>
  );
}
