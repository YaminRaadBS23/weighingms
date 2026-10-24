import { describe, expect, it } from 'vitest';
import { WeighingSession, type ComponentSpec, type RecipeSnapshot } from './weighing-session';

const T0 = new Date('2026-10-24T07:00:00Z');
const T1 = new Date('2026-10-24T07:01:00Z');
const T2 = new Date('2026-10-24T07:02:00Z');
const FUTURE = '2027-03-31T00:00:00Z';

const spec = (sequence: number): ComponentSpec => ({
  sequence,
  dyestuff: {
    code: `DYE-000${sequence}`,
    name: `Dye ${sequence}`,
    shortName: `D${sequence}`,
    colourHex: '#000000',
    type: 'DYE',
  },
  target: { value: '94.0', unit: 'g' },
  tolerance: { value: '0.5', unit: 'g' },
  barMax: { value: '125', unit: 'g' },
  suggestedLotId: '2026-0387',
});

const recipe: RecipeSnapshot = {
  recipeId: 'RCP',
  version: '1',
  shade: 'Teal 4C',
  components: [1, 2, 3].map(spec),
  takenAt: T0.toISOString(),
};

const start = () =>
  WeighingSession.start({
    sessionId: 'S-1',
    batchId: 'B-24187',
    stationId: 'STN-01',
    startedBy: 'OP-0417',
    recipe,
    now: T0,
  });

const auto = (scaleId: string | null) => ({
  scaleId,
  mode: 'AUTO' as const,
  reason: scaleId ? null : ('NO_SUITABLE_SCALE' as const),
  requirement: { value: '308.5', unit: 'g' as const },
});
const lot = { lotId: '2026-0387', source: 'DEFAULT' as const };
const container = {
  containerId: 'C-12',
  tare: { value: '214.0', unit: 'g' as const },
  source: 'DEFAULT' as const,
};
const tare = { value: '214.0', unit: 'g' as const };

/** Component 1 fully prepared and unlocked on scale-3kg. */
function unlocked() {
  const s = start();
  s.assignScale(1, auto('scale-3kg'), T0);
  s.verifyIdentity(1, 'DYE-0001', T0);
  s.setLot(1, lot, T0);
  s.setContainer(1, container, T0);
  s.applyTare(1, tare, T1);
  return s;
}
const prep = (s: WeighingSession, seq = 1) => s.snapshot().components[seq - 1]!;

describe('WeighingSession — preparation (bolt 009)', () => {
  it('a new session has component 1 active with no scale and an empty preparation; others have none (invariant 8)', () => {
    const [c1, c2, c3] = start().snapshot().components;
    expect(c1!.scale).toEqual({
      scaleId: null,
      mode: 'AUTO',
      reason: 'NO_SUITABLE_SCALE',
      requirement: null,
    });
    expect(c1!.preparation).toEqual({
      identityVerifiedAt: null,
      lot: null,
      container: null,
      tareApplied: null,
      unlockedAt: null,
    });
    expect([c2!.scale, c2!.preparation, c3!.scale, c3!.preparation]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  describe('states', () => {
    it('AWAITING_IDENTITY → AWAITING_MATERIAL → AWAITING_TARE → UNLOCKED', () => {
      const s = start();
      expect(s.preparationState(1)).toBe('AWAITING_IDENTITY');
      s.verifyIdentity(1, 'DYE-0001', T0);
      expect(s.preparationState(1)).toBe('AWAITING_MATERIAL');
      s.setLot(1, lot, T0);
      expect(s.preparationState(1)).toBe('AWAITING_MATERIAL');
      s.setContainer(1, container, T0);
      expect(s.preparationState(1)).toBe('AWAITING_TARE');
      s.applyTare(1, tare, T1);
      expect(s.preparationState(1)).toBe('UNLOCKED');
      expect(prep(s).preparation).toMatchObject({
        tareApplied: tare,
        unlockedAt: T1.toISOString(),
      });
    });
    it('lot and container may be set before the dyestuff is verified (invariant 11)', () => {
      const s = start();
      s.setLot(1, lot, T0);
      s.setContainer(1, container, T0);
      expect(s.preparationState(1)).toBe('AWAITING_IDENTITY');
      s.verifyIdentity(1, 'DYE-0001', T0);
      expect(s.preparationState(1)).toBe('AWAITING_TARE');
    });
  });

  describe('identity (invariant 10)', () => {
    it('another dyestuff → WRONG_DYESTUFF and nothing changes', () => {
      const s = start();
      const before = s.snapshot();
      expect(() => s.verifyIdentity(1, 'DYE-0002', T1)).toThrow(
        expect.objectContaining({ code: 'WRONG_DYESTUFF', httpStatus: 422 }),
      );
      expect(s.snapshot()).toEqual(before);
    });
    it('the code is normalised (case and spaces)', () => {
      const s = start();
      s.verifyIdentity(1, ' dye-0001 ', T0);
      expect(s.preparationState(1)).toBe('AWAITING_MATERIAL');
    });
    it('verifying again keeps the first verification time', () => {
      const s = start();
      s.verifyIdentity(1, 'DYE-0001', T0);
      s.verifyIdentity(1, 'DYE-0001', T2);
      expect(prep(s).preparation!.identityVerifiedAt).toBe(T0.toISOString());
    });
  });

  describe('tare', () => {
    it('cannot be applied before identity, lot and container are settled → IDENTITY_NOT_VERIFIED', () => {
      const s = start();
      expect(() => s.applyTare(1, tare, T1)).toThrow(
        expect.objectContaining({ code: 'IDENTITY_NOT_VERIFIED' }),
      );
      s.verifyIdentity(1, 'DYE-0001', T0);
      s.setLot(1, lot, T0);
      expect(() => s.applyTare(1, tare, T1)).toThrow(
        expect.objectContaining({ code: 'IDENTITY_NOT_VERIFIED' }),
      );
    });
    it('a new container discards the tare (invariant 12)', () => {
      const s = unlocked();
      s.setContainer(1, { ...container, containerId: 'C-09', source: 'SCANNED' }, T2);
      expect(s.preparationState(1)).toBe('AWAITING_TARE');
      expect(prep(s).preparation).toMatchObject({ tareApplied: null, unlockedAt: null });
      expect(prep(s).preparation!.container).toMatchObject({
        containerId: 'C-09',
        source: 'SCANNED',
      });
    });
    it('a different scale discards the tare; the same scale keeps it', () => {
      const s = unlocked();
      s.assignScale(1, auto('scale-3kg'), T2);
      expect(s.preparationState(1)).toBe('UNLOCKED');
      s.assignScale(1, { ...auto('scale-32kg'), mode: 'MANUAL' }, T2);
      expect(s.preparationState(1)).toBe('AWAITING_TARE');
      expect(prep(s).scale).toMatchObject({ scaleId: 'scale-32kg', mode: 'MANUAL' });
    });
    it('a new lot keeps the tare', () => {
      const s = unlocked();
      s.setLot(1, { lotId: '2026-0402', source: 'SCANNED' }, T2);
      expect(s.preparationState(1)).toBe('UNLOCKED');
      expect(prep(s).preparation!.lot).toEqual({ lotId: '2026-0402', source: 'SCANNED' });
    });
  });

  describe('activation discards unconfirmed preparation (invariant 8)', () => {
    it('the previous component loses scale and preparation; the new one starts empty', () => {
      const s = unlocked();
      s.activate(3, T2);
      expect(prep(s, 1)).toMatchObject({ state: 'PENDING', scale: null, preparation: null });
      expect(prep(s, 3)).toMatchObject({ state: 'ACTIVE' });
      expect(s.preparationState(3)).toBe('AWAITING_IDENTITY');
      expect(prep(s, 3).scale).toMatchObject({ scaleId: null, reason: 'NO_SUITABLE_SCALE' });
    });
    it('activating the active component again keeps its preparation', () => {
      const s = unlocked();
      s.activate(1, T2);
      expect(s.preparationState(1)).toBe('UNLOCKED');
    });
    it('coming back to a component starts from scratch', () => {
      const s = unlocked();
      s.activate(2, T2);
      s.activate(1, T2);
      expect(s.preparationState(1)).toBe('AWAITING_IDENTITY');
    });
  });

  describe('guards', () => {
    it('preparation actions are refused for a pending, unknown or done component and a suspended session', () => {
      const s = start();
      expect(() => s.verifyIdentity(2, 'DYE-0002', T0)).toThrow(
        expect.objectContaining({ code: 'COMPONENT_NOT_ACTIVE', httpStatus: 409 }),
      );
      expect(() => s.verifyIdentity(9, 'DYE-0009', T0)).toThrow(
        expect.objectContaining({ code: 'COMPONENT_NOT_FOUND' }),
      );
      const props = start().snapshot();
      props.components[0]!.state = 'DONE';
      expect(() => WeighingSession.restore(props).setLot(1, lot, T0)).toThrow(
        expect.objectContaining({ code: 'COMPONENT_ALREADY_DONE' }),
      );
      const suspended = start().snapshot();
      suspended.status = 'SUSPENDED';
      expect(() =>
        WeighingSession.restore(suspended).assignScale(1, auto('scale-3kg'), T0),
      ).toThrow(expect.objectContaining({ code: 'SESSION_NOT_IN_PROGRESS' }));
    });
    it('requireUnlocked: refused until the tare is applied, then passes (story 004, confirm guard)', () => {
      const s = start();
      expect(() => s.requireUnlocked(1)).toThrow(
        expect.objectContaining({ code: 'IDENTITY_NOT_VERIFIED', httpStatus: 409 }),
      );
      expect(() => unlocked().requireUnlocked(1)).not.toThrow();
    });
    it('requireScaleUsable: expired → SCALE_CALIBRATION_EXPIRED, offline → SCALE_UNAVAILABLE, valid → nothing', () => {
      const s = start();
      const scale = {
        scaleId: 'scale-3kg',
        capacity: { value: '3', unit: 'kg' as const },
        calibrationDueAt: FUTURE,
        connected: true,
      };
      expect(() => s.requireScaleUsable(scale, T0)).not.toThrow();
      expect(() =>
        s.requireScaleUsable({ ...scale, calibrationDueAt: '2026-10-01T00:00:00Z' }, T0),
      ).toThrow(expect.objectContaining({ code: 'SCALE_CALIBRATION_EXPIRED', httpStatus: 422 }));
      expect(() => s.requireScaleUsable({ ...scale, connected: false }, T0)).toThrow(
        expect.objectContaining({ code: 'SCALE_UNAVAILABLE', httpStatus: 503 }),
      );
    });
  });

  it('snapshot and restore round-trip the preparation without sharing state', () => {
    const s = unlocked();
    const copy = WeighingSession.restore(s.snapshot());
    expect(copy.snapshot()).toEqual(s.snapshot());
    copy.setLot(1, { lotId: '2026-0402', source: 'SCANNED' }, T2);
    expect(prep(s).preparation!.lot!.lotId).toBe('2026-0387');
  });
});
