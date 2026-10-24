import { describe, expect, it } from 'vitest';
import { buildRecord } from './weighing-record';
import { WeighingSession, type ComponentSpec, type RecipeSnapshot } from './weighing-session';

const T0 = new Date('2026-10-25T07:00:00Z');
const T1 = new Date('2026-10-25T07:05:00Z');

const spec = (sequence: number): ComponentSpec => ({
  sequence,
  dyestuff: {
    code: `DYE-000${sequence}`,
    name: `Dye ${sequence}`,
    shortName: 'D',
    colourHex: '#000',
    type: 'DYE',
  },
  target: { value: '94.0', unit: 'g' },
  tolerance: { value: '0.5', unit: 'g' },
  barMax: { value: '125', unit: 'g' },
  suggestedLotId: '2026-0387',
});
const recipe = (n: number): RecipeSnapshot => ({
  recipeId: 'RCP',
  version: '1',
  shade: 'Teal 4C',
  components: Array.from({ length: n }, (_, i) => spec(i + 1)),
  takenAt: T0.toISOString(),
});

const start = (n = 5) =>
  WeighingSession.start({
    sessionId: 'S-1',
    batchId: 'B-24187',
    stationId: 'STN-01',
    startedBy: 'OP-0417',
    recipe: recipe(n),
    now: T0,
  });

const SCALE = {
  scaleId: 'scale-3kg',
  mode: 'AUTO' as const,
  reason: null,
  requirement: { value: '308.5', unit: 'g' as const },
};
const tare = { value: '214.0', unit: 'g' as const };

/** Brings the active component to UNLOCKED. */
function unlock(s: WeighingSession, seq: number) {
  s.assignScale(seq, SCALE, T0);
  s.verifyIdentity(seq, `DYE-000${seq}`, T0);
  s.setLot(seq, { lotId: '2026-0387', source: 'DEFAULT' }, T0);
  s.setContainer(seq, { containerId: 'C-12', tare, source: 'DEFAULT' }, T0);
  s.applyTare(seq, tare, T0);
}
const states = (s: WeighingSession) => s.snapshot().components.map((c) => c.state);
const active = (s: WeighingSession) => states(s).filter((x) => x === 'ACTIVE').length;

describe('confirm → progression (invariants 16, 18)', () => {
  it('a confirmed component is DONE and the lowest pending one becomes ACTIVE with an empty preparation', () => {
    const s = start();
    unlock(s, 1);
    expect(s.confirm(1, T1)).toBe(2);
    expect(states(s)).toEqual(['DONE', 'ACTIVE', 'PENDING', 'PENDING', 'PENDING']);
    expect(s.snapshot().components[0]).toMatchObject({ scale: null, preparation: null });
    expect(s.preparationState(2)).toBe('AWAITING_IDENTITY');
    expect(s.doneCount).toBe(1);
    expect(s.status).toBe('IN_PROGRESS');
  });

  it('runs Blue → Red → Yellow → Sodium Sulphate → Soda Ash and completes after the fifth', () => {
    const s = start(5);
    const order: (number | null)[] = [];
    for (let seq = 1; seq <= 5; seq++) {
      expect(s.activeSequence).toBe(seq);
      expect(active(s)).toBe(1); // exactly one ACTIVE while weighing
      unlock(s, seq);
      order.push(s.confirm(seq, T1));
    }
    expect(order).toEqual([2, 3, 4, 5, null]);
    expect(states(s)).toEqual(['DONE', 'DONE', 'DONE', 'DONE', 'DONE']);
    expect(s.status).toBe('COMPLETED');
    expect(s.snapshot().completedAt).toBe(T1.toISOString());
    expect(active(s)).toBe(0);
  });

  it('after an out-of-order activation, progression still takes the lowest pending component', () => {
    const s = start();
    s.activate(3, T0);
    unlock(s, 3);
    expect(s.confirm(3, T1)).toBe(1);
    expect(states(s)).toEqual(['ACTIVE', 'PENDING', 'DONE', 'PENDING', 'PENDING']);
  });

  it('a component that is not unlocked cannot be confirmed (IDENTITY_NOT_VERIFIED)', () => {
    const s = start();
    expect(() => s.confirm(1, T1)).toThrow(
      expect.objectContaining({ code: 'IDENTITY_NOT_VERIFIED' }),
    );
    s.verifyIdentity(1, 'DYE-0001', T0);
    expect(() => s.confirm(1, T1)).toThrow(
      expect.objectContaining({ code: 'IDENTITY_NOT_VERIFIED' }),
    );
    expect(states(s)[0]).toBe('ACTIVE');
  });

  it('DONE is final: confirming, activating or re-taring a DONE component → COMPONENT_ALREADY_DONE', () => {
    const s = start();
    unlock(s, 1);
    s.confirm(1, T1);
    expect(() => s.confirm(1, T1)).toThrow(
      expect.objectContaining({ code: 'COMPONENT_ALREADY_DONE', httpStatus: 409 }),
    );
    expect(() => s.activate(1, T1)).toThrow(
      expect.objectContaining({ code: 'COMPONENT_ALREADY_DONE' }),
    );
    expect(() => s.retare(1, tare, T1)).toThrow(
      expect.objectContaining({ code: 'COMPONENT_ALREADY_DONE' }),
    );
  });

  it('a component that is not active cannot be confirmed (COMPONENT_NOT_ACTIVE)', () => {
    const s = start();
    expect(() => s.confirm(3, T1)).toThrow(
      expect.objectContaining({ code: 'COMPONENT_NOT_ACTIVE' }),
    );
  });
});

describe('complete (invariant 19)', () => {
  it('with open components → BATCH_INCOMPLETE (422) and details done / total', () => {
    const s = start();
    unlock(s, 1);
    s.confirm(1, T1);
    expect(() => s.complete(T1)).toThrow(
      expect.objectContaining({
        code: 'BATCH_INCOMPLETE',
        httpStatus: 422,
        details: { done: 1, total: 5 },
      }),
    );
    expect(s.status).toBe('IN_PROGRESS');
  });

  it('is idempotent on a completed session and keeps the first completion time', () => {
    const s = start(1);
    unlock(s, 1);
    s.confirm(1, T1);
    s.complete(new Date('2026-10-25T09:00:00Z'));
    expect(s.snapshot().completedAt).toBe(T1.toISOString());
    expect(s.status).toBe('COMPLETED');
  });

  it('a completed session refuses every component action with SESSION_COMPLETED (409)', () => {
    const s = start(1);
    unlock(s, 1);
    s.confirm(1, T1);
    const refused = expect.objectContaining({ code: 'SESSION_COMPLETED', httpStatus: 409 });
    expect(() => s.activate(1, T1)).toThrow(refused);
    expect(() => s.verifyIdentity(1, 'DYE-0001', T1)).toThrow(refused);
    expect(() => s.retare(1, tare, T1)).toThrow(refused);
    expect(() => s.suspend(T1)).toThrow(refused);
    expect(() => s.confirm(1, T1)).toThrow(refused);
  });

  it('a suspended session cannot be completed (SESSION_NOT_IN_PROGRESS)', () => {
    const s = start();
    s.suspend(T1);
    expect(() => s.complete(T1)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_IN_PROGRESS' }),
    );
  });
});

describe('retare (invariant 20)', () => {
  it('replaces the tare of an unlocked component and keeps it unlocked', () => {
    const s = start();
    unlock(s, 1);
    s.retare(1, { value: '264.0', unit: 'g' }, T1);
    expect(s.preparationState(1)).toBe('UNLOCKED');
    expect(s.snapshot().components[0]!.preparation!.tareApplied).toEqual({
      value: '264.0',
      unit: 'g',
    });
  });
  it('a locked component cannot be re-tared', () => {
    const s = start();
    expect(() => s.retare(1, tare, T1)).toThrow(
      expect.objectContaining({ code: 'IDENTITY_NOT_VERIFIED' }),
    );
  });
  it('does not touch DONE components', () => {
    const s = start();
    unlock(s, 1);
    s.confirm(1, T1);
    unlock(s, 2);
    s.retare(2, tare, T1);
    expect(states(s)[0]).toBe('DONE');
  });
});

describe('suspend and resume (invariant 21)', () => {
  it('quit: the unconfirmed component returns to PENDING, nothing is ACTIVE, DONE components stay', () => {
    const s = start();
    unlock(s, 1);
    s.confirm(1, T1);
    unlock(s, 2);
    s.suspend(T1);
    expect(s.status).toBe('SUSPENDED');
    expect(states(s)).toEqual(['DONE', 'PENDING', 'PENDING', 'PENDING', 'PENDING']);
    expect(s.activeSequence).toBeNull();
    expect(s.snapshot().components[1]).toMatchObject({
      scale: null,
      preparation: null,
      activatedAt: null,
    });
  });

  it('quit with nothing weighed is allowed', () => {
    const s = start();
    s.suspend(T1);
    expect(s.status).toBe('SUSPENDED');
  });

  it('resume: IN_PROGRESS again, the lowest pending component ACTIVE and locked', () => {
    const s = start();
    unlock(s, 1);
    s.confirm(1, T1);
    unlock(s, 2);
    s.suspend(T1);
    expect(s.resume(T1)).toBe(2);
    expect(s.status).toBe('IN_PROGRESS');
    expect(states(s)).toEqual(['DONE', 'ACTIVE', 'PENDING', 'PENDING', 'PENDING']);
    expect(s.preparationState(2)).toBe('AWAITING_IDENTITY');
  });

  it('an operator’s out-of-order choice is not remembered across a quit (O-3)', () => {
    const s = start();
    s.activate(4, T0);
    s.suspend(T1);
    expect(s.resume(T1)).toBe(1);
  });

  it('quit twice, or resume an in-progress session → SESSION_NOT_IN_PROGRESS', () => {
    const s = start();
    expect(() => s.resume(T1)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_IN_PROGRESS' }),
    );
    s.suspend(T1);
    expect(() => s.suspend(T1)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_IN_PROGRESS' }),
    );
  });

  it('snapshot / restore keeps suspended and completed states', () => {
    const s = start();
    s.suspend(T1);
    expect(WeighingSession.restore(s.snapshot()).status).toBe('SUSPENDED');
  });
});

describe('buildRecord — snapshot of the facts at confirmation (FR-19)', () => {
  it('copies target, limits, lot, container, tare, scale, operator and time; result IN_TOLERANCE', () => {
    const record = buildRecord({
      recordId: 'R-1',
      sessionId: 'S-1',
      batchId: 'B-24187',
      spec: spec(3),
      actual: { value: '94.2', unit: 'g' },
      lotId: '2026-0387',
      containerId: 'C-12',
      tare,
      scaleId: 'scale-3kg',
      operatorId: 'OP-0417',
      confirmedAt: T1,
    });
    expect(record).toEqual({
      recordId: 'R-1',
      sessionId: 'S-1',
      batchId: 'B-24187',
      sequence: 3,
      dyestuffCode: 'DYE-0003',
      dyestuffName: 'Dye 3',
      actual: { value: '94.2', unit: 'g' },
      target: { value: '94.0', unit: 'g' },
      toleranceLower: { value: '93.5', unit: 'g' },
      toleranceUpper: { value: '94.5', unit: 'g' },
      lotId: '2026-0387',
      containerId: 'C-12',
      tare,
      scaleId: 'scale-3kg',
      operatorId: 'OP-0417',
      confirmedAt: T1.toISOString(),
      result: 'IN_TOLERANCE',
      surplus: null,
    });
  });
  it('does not share objects with its inputs', () => {
    const input = { value: '94.2', unit: 'g' as const };
    const record = buildRecord({
      recordId: 'R',
      sessionId: 'S',
      batchId: 'B',
      spec: spec(1),
      actual: input,
      lotId: 'L',
      containerId: 'C',
      tare,
      scaleId: 'x',
      operatorId: 'O',
      confirmedAt: T1,
    });
    input.value = '1';
    expect(record.actual.value).toBe('94.2');
  });
});
