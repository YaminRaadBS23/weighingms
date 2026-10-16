import { describe, expect, it } from 'vitest';
import {
  WeighingSession,
  type ComponentSpec,
  type RecipeSnapshot,
  type WeighingSessionProps,
} from './weighing-session';

const T0 = new Date('2026-10-16T07:00:00Z');
const T1 = new Date('2026-10-16T07:05:00Z');

const spec = (sequence: number): ComponentSpec => ({
  sequence,
  dyestuff: {
    code: `DYE-${sequence}`,
    name: `Dye ${sequence}`,
    shortName: `D${sequence}`,
    colourHex: '#000000',
    type: 'DYE',
  },
  target: { value: '94.0', unit: 'g' },
  tolerance: { value: '0.5', unit: 'g' },
  barMax: { value: '125', unit: 'g' },
  suggestedLotId: null,
});

const recipe = (n = 5): RecipeSnapshot => ({
  recipeId: 'RCP-TEAL-4C',
  version: '1',
  shade: 'Teal 4C',
  components: Array.from({ length: n }, (_, i) => spec(i + 1)),
  takenAt: T0.toISOString(),
});

const start = () =>
  WeighingSession.start({
    sessionId: 'S-1',
    batchId: 'B-24187',
    stationId: 'STN-01',
    startedBy: 'OP-0417',
    recipe: recipe(),
    now: T0,
  });

const states = (s: WeighingSession) => s.snapshot().components.map((c) => c.state);
const activeCount = (s: WeighingSession) => states(s).filter((x) => x === 'ACTIVE').length;

/** A session restored with some components already DONE (DONE is reached by confirmation, bolt 010). */
function withDone(done: number[], active: number): WeighingSession {
  const props: WeighingSessionProps = start().snapshot();
  props.components = props.components.map((c) => ({
    ...c,
    state: done.includes(c.sequence) ? 'DONE' : c.sequence === active ? 'ACTIVE' : 'PENDING',
  }));
  return WeighingSession.restore(props);
}

describe('WeighingSession aggregate', () => {
  it('starts IN_PROGRESS with component 1 ACTIVE and 2–5 PENDING (invariants 1–3)', () => {
    const s = start();
    expect(s.status).toBe('IN_PROGRESS');
    expect(states(s)).toEqual(['ACTIVE', 'PENDING', 'PENDING', 'PENDING', 'PENDING']);
    expect(s.activeSequence).toBe(1);
    expect(s.doneCount).toBe(0);
    expect(s.snapshot()).toMatchObject({
      orgatexStatusSync: 'SYNCED',
      startedAt: T0.toISOString(),
      completedAt: null,
    });
  });

  it('refuses a recipe without components or with gaps in the sequence', () => {
    for (const components of [[], [spec(1), spec(3)]]) {
      expect(() =>
        WeighingSession.start({
          sessionId: 'S',
          batchId: 'B',
          stationId: 'STN-01',
          startedBy: 'OP',
          recipe: { ...recipe(), components },
          now: T0,
        }),
      ).toThrow();
    }
  });

  it('activating 3 makes it ACTIVE and returns the previous ACTIVE component to PENDING (invariant 4)', () => {
    const s = start();
    s.activate(3, T1);
    expect(states(s)).toEqual(['PENDING', 'PENDING', 'ACTIVE', 'PENDING', 'PENDING']);
    const c = s.snapshot().components;
    expect(c[0]?.activatedAt).toBeNull(); // unconfirmed weighing of component 1 discarded
    expect(c[2]?.activatedAt).toBe(T1.toISOString());
    expect(s.snapshot().updatedAt).toBe(T1.toISOString());
  });

  it('activating the ACTIVE component is a no-op', () => {
    const s = start();
    s.activate(1, T1);
    expect(s.snapshot().updatedAt).toBe(T0.toISOString());
    expect(s.activeSequence).toBe(1);
  });

  it('a DONE component cannot be activated (invariant 5)', () => {
    const s = withDone([1, 2], 3);
    expect(() => s.activate(1, T1)).toThrow(
      expect.objectContaining({ code: 'COMPONENT_ALREADY_DONE', httpStatus: 409 }),
    );
    expect(states(s)).toEqual(['DONE', 'DONE', 'ACTIVE', 'PENDING', 'PENDING']);
  });

  it('activation never touches DONE components', () => {
    const s = withDone([1, 2], 3);
    s.activate(5, T1);
    expect(states(s)).toEqual(['DONE', 'DONE', 'PENDING', 'PENDING', 'ACTIVE']);
    expect(s.doneCount).toBe(2);
  });

  it('an unknown sequence → COMPONENT_NOT_FOUND', () => {
    expect(() => start().activate(9, T1)).toThrow(
      expect.objectContaining({ code: 'COMPONENT_NOT_FOUND', httpStatus: 404 }),
    );
  });

  it('component actions are refused unless IN_PROGRESS (invariant 7)', () => {
    const props = start().snapshot();
    const suspended = WeighingSession.restore({ ...props, status: 'SUSPENDED' });
    expect(() => suspended.activate(2, T1)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_IN_PROGRESS' }),
    );
  });

  it('exactly one component is ACTIVE after any sequence of activations (invariant 2)', () => {
    const s = start();
    for (const n of [3, 5, 2, 2, 4, 1, 5]) {
      s.activate(n, T1);
      expect(activeCount(s)).toBe(1);
    }
  });

  it('the recipe snapshot is never changed by actions and snapshots are copies (invariant 6)', () => {
    const s = start();
    const before = JSON.stringify(s.snapshot().recipe);
    s.activate(4, T1);
    const copy = s.snapshot();
    copy.recipe.shade = 'tampered';
    copy.components[0]!.state = 'DONE';
    expect(JSON.stringify(s.snapshot().recipe)).toBe(before);
    expect(s.snapshot().components[0]?.state).toBe('PENDING');
  });

  it('marks the OrgaTEX status as deferred', () => {
    const s = start();
    s.markOrgatexStatusDeferred();
    expect(s.snapshot().orgatexStatusSync).toBe('DEFERRED');
  });
});
