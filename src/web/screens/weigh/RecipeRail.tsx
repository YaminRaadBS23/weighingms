import type { SessionView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import { qty } from '../../shared/format';
import styles from './WeighScreen.module.css';

interface Props {
  session: SessionView;
  disabled: boolean;
  onTouch: (sequence: number) => void;
}

/** Prototype `.rail`: recipe head plus one touch row per component (done / active / pending). */
export function RecipeRail({ session, disabled, onTouch }: Props) {
  return (
    <aside className={styles.rail} aria-label={t('weigh.recipe', { shade: session.recipe.shade })}>
      <div className={styles.railHead}>
        <span className={styles.t}>{t('weigh.recipe', { shade: session.recipe.shade })}</span>
        <span className={styles.v}>{session.batchId}</span>
        <span className={styles.m}>
          {t('weigh.components', { done: session.doneCount, total: session.componentCount })}
        </span>
      </div>
      <ul className={styles.comps}>
        {session.components.map((c) => (
          <li key={c.sequence}>
            <button
              type="button"
              className={styles.comp}
              data-state={c.state}
              aria-current={c.state === 'ACTIVE' ? 'true' : undefined}
              disabled={disabled || c.state === 'DONE'}
              onClick={() => c.state === 'PENDING' && onTouch(c.sequence)}
            >
              <span className={styles.swatch} style={{ background: c.dyestuff.colourHex }} />
              <span>
                <span className={styles.nm}>{c.dyestuff.name}</span>
                <br />
                <span className={styles.sub}>{c.dyestuff.code}</span>
              </span>
              <span className={styles.qty}>
                {qty(c.target)}
                <br />
                <span className={styles.st}>
                  {c.state === 'DONE' && c.confirmed
                    ? t('weigh.rail.done', { actual: qty(c.confirmed.actual) })
                    : c.state === 'ACTIVE'
                      ? t('weigh.rail.active')
                      : t('weigh.rail.pending')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
