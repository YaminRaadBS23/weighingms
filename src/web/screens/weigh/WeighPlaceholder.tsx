import type { SessionView } from '../../../shared/weighing';
import { t } from '../../i18n/messages';
import { qty } from '../../shared/format';
import styles from './WeighPlaceholder.module.css';

/**
 * INTERIM (bolt 007): shown after a session starts until the real 2 · Weigh screen arrives in
 * bolt 011. Displays the session's recipe snapshot as delivered by the API.
 */
export function WeighPlaceholder({ session }: { session: SessionView }) {
  return (
    <section className={styles.placeholder}>
      <div className={styles.head}>
        <span className={styles.t}>{t('weigh.recipe', { shade: session.recipe.shade })}</span>
        <span className={styles.v}>{session.batchId}</span>
        <span className={styles.m}>
          {t('weigh.components', { done: session.doneCount, total: session.componentCount })}
        </span>
      </div>
      <ul className={styles.list}>
        {session.components.map((c) => (
          <li key={c.sequence} className={styles.row} data-state={c.state}>
            <span className={styles.swatch} style={{ background: c.dyestuff.colourHex }} />
            <span>
              <span className={styles.nm}>{c.dyestuff.name}</span>
              <br />
              <span className={styles.sub}>{c.dyestuff.code}</span>
            </span>
            <span className={styles.qty}>
              {qty(c.target)}
              <br />
              <span className={styles.st}>{c.state}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note} role="note">
        <b>{t('weigh.placeholderTitle')}.</b> {t('weigh.placeholderNote')}
      </p>
    </section>
  );
}
