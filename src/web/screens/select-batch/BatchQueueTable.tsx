import type { BatchSummary } from '../../../shared/batches';
import { t, type MessageKey } from '../../i18n/messages';
import styles from './SelectBatch.module.css';

interface Props {
  items: BatchSummary[];
  selectedId: string | null;
  onRowTouch: (b: BatchSummary) => void;
}

/** Prototype `table.q`: the batch queue; each row is a large touch target. */
export function BatchQueueTable({ items, selectedId, onRowTouch }: Props) {
  return (
    <table className={styles.q}>
      <thead>
        <tr>
          {(['batch', 'order', 'machine', 'fabric', 'shade', 'components', 'status'] as const).map(
            (c) => (
              <th key={c} scope="col">
                {t(`queue.col.${c}` as MessageKey)}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {items.map((b) => (
          <tr
            key={b.batchId}
            className={[
              b.batchId === selectedId ? styles.sel : '',
              b.selectable ? '' : styles.blocked,
            ].join(' ')}
            onClick={() => onRowTouch(b)}
            aria-disabled={!b.selectable}
            data-testid={`row-${b.batchId}`}
          >
            <td className={styles.mono}>
              <button
                type="button"
                className={styles.rowButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onRowTouch(b);
                }}
              >
                {b.batchId}
              </button>
            </td>
            <td className={styles.mono}>{b.orderRef}</td>
            <td className={styles.mono}>{b.machineRef}</td>
            <td>
              {b.fabric.description} · {b.fabric.weight.value} {b.fabric.weight.unit}
            </td>
            <td>{b.shade}</td>
            <td className={styles.mono}>{b.componentCount}</td>
            <td>
              <span className={`${styles.tag} ${b.status === 'WEIGHING' ? styles.now : ''}`}>
                {t(`status.${b.status}` as MessageKey)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
