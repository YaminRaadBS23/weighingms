import { useEffect, useState, type ReactNode } from 'react';
import type { OperatorView } from '../../shared/weighing';
import styles from './Shell.module.css';
import { StatusStrip } from './StatusStrip';
import { TopBar, type CrumbData } from './TopBar';

interface Props {
  crumb: CrumbData | null;
  operator: OperatorView | null;
  onSignOut: () => void;
  children: ReactNode;
}

/** Prototype `.screen`: the dark HMI terminal — top bar, current view, status strip. */
export function Shell({ crumb, operator, onSignOut, children }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.screen} aria-label="Screen">
      <TopBar stationLabel="01" crumb={crumb} operator={operator} onSignOut={onSignOut} />
      <main className={styles.view}>{children}</main>
      <StatusStrip now={now} />
    </div>
  );
}
