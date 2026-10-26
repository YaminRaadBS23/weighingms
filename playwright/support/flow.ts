import { Api, type RecipeComponent } from './api';
import { Station } from './station';

export interface Weighing {
  component: RecipeComponent;
  sessionId: string;
  scaleId: string;
}

/**
 * Puts the station in front of component `done + 1` of B-24187: the first `done` components are
 * confirmed through the API, then the UI is opened and the next dyestuff is scanned and unlocked.
 */
export async function beginAt(api: Api, station: Station, done: number): Promise<Weighing> {
  const recipe = await api.recipe();
  const session = await api.weighFirst(done);
  await station.open();
  const component = recipe[done]!;
  await station.unlock(component.dyestuff.code);
  const { scaleId } = await api.active(session.sessionId);
  return { component, sessionId: session.sessionId, scaleId };
}

/** Weighs the last component through the UI (the Dummy scale lands on its target) and confirms. */
export async function finishLast(api: Api, station: Station, w: Weighing) {
  await api.sim.dispense(w.scaleId, w.component.target);
  await station.confirmWhenReady();
}
