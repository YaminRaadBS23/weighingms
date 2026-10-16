import { useEffect, useState } from 'react';
import type { SessionView, OperatorView } from '../shared/weighing';
import { api } from './services/api-client';
import { SelectBatchScreen } from './screens/select-batch/SelectBatchScreen';
import { SignInScreen } from './screens/sign-in/SignInScreen';
import { WeighPlaceholder } from './screens/weigh/WeighPlaceholder';
import { Shell } from './shell/Shell';
import type { CrumbData } from './shell/TopBar';

interface StationState {
  loaded: boolean;
  operator: OperatorView | null;
  session: SessionView | null;
  crumb: CrumbData | null;
}

/** Reads where the station was (operator, session in progress) — used on load and reload. */
async function restoreStation(): Promise<StationState> {
  try {
    const [{ operator }, { session }] = await Promise.all([
      api.currentOperator(),
      api.currentSession(),
    ]);
    let crumb: CrumbData | null = null;
    if (session) {
      try {
        const b = await api.batch(session.batchId);
        crumb = { batchId: b.batchId, orderRef: b.orderRef, machineRef: b.machineRef };
      } catch {
        // OrgaTEX offline: the session works from its snapshot; the crumb shows the batch only.
        crumb = { batchId: session.batchId, orderRef: '—', machineRef: '—' };
      }
    }
    return { loaded: true, operator, session, crumb };
  } catch {
    return { loaded: true, operator: null, session: null, crumb: null };
  }
}

/**
 * Station UI root. On load (or reload) it restores where the station was from the API:
 * no operator → sign-in; a session in progress → weigh; otherwise → select batch.
 */
export function App() {
  const [state, setState] = useState<StationState>({
    loaded: false,
    operator: null,
    session: null,
    crumb: null,
  });

  useEffect(() => {
    let active = true;
    void restoreStation().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const signOut = async () => {
    await api.signOut();
    setState((s) => ({ ...s, operator: null }));
  };

  let view = null;
  if (state.loaded) {
    if (!state.operator) {
      view = <SignInScreen onSignedIn={(operator) => setState((s) => ({ ...s, operator }))} />;
    } else if (state.session) {
      view = <WeighPlaceholder session={state.session} />;
    } else {
      view = (
        <SelectBatchScreen
          onSessionStarted={(session, b) =>
            setState((s) => ({
              ...s,
              session,
              crumb: { batchId: b.batchId, orderRef: b.orderRef, machineRef: b.machineRef },
            }))
          }
        />
      );
    }
  }

  return (
    <Shell crumb={state.crumb} operator={state.operator} onSignOut={() => void signOut()}>
      {view}
    </Shell>
  );
}
