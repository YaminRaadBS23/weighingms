/**
 * Supervisor override and evaluation with a fake scale (ddd-01/02, ADR-7, ADR-9, Step 24 / TD-10).
 * Real SQLite (in memory), real PIN hashing with the training supervisor BDG-0901 / 2580.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  FUTURE,
  NOW,
  PAST,
  closeDb,
  confirmOnTarget,
  current,
  g,
  kg,
  started,
  states,
  unlock,
  type T,
} from './confirmation-test-support';
import type { OverrideCommand } from './component-override';

afterEach(closeDb);

const SUP: OverrideCommand = {
  supervisorBadge: 'BDG-0901',
  pin: '2580',
  reason: 'Customer approved',
};
type S = T & { sid: string };

/** Unlocks component `seq` (the active one) and puts `net` on the fake scale. */
async function ready(t: S, seq: number, net: ReturnType<typeof g>, stable = true) {
  await unlock(t, seq);
  t.scales.net = net;
  t.scales.stable = stable;
}
/** Everything a refusal must leave untouched. */
function snapshotOf(t: S) {
  return {
    records: t.w.ctx.records.listBySession(t.sid).length,
    audit: t.w.auditLog.listForSession(t.sid).length,
    states: states(t, t.sid),
    updatedAt: current(t, t.sid).snapshot().updatedAt,
  };
}
async function toYellow() {
  const t = await started();
  await confirmOnTarget(t, 1);
  await confirmOnTarget(t, 2);
  return t;
}

describe('override — what is recorded (story 013/014, FR-22, FR-20, ADR-9)', () => {
  it('96.4 g on Yellow (over): OVERRIDDEN, surplus +2.4 g (+2.6 %) from the target, audit event, DONE, next ACTIVE', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    const { record, session } = await t.w.override.override(t.sid, 3, SUP);
    expect(record).toMatchObject({
      sequence: 3,
      actual: g('96.4'),
      target: g('94.0'),
      toleranceLower: g('93.5'),
      toleranceUpper: g('94.5'),
      result: 'OVERRIDDEN',
      surplus: { amount: g('2.4'), percent: '2.6' },
      operatorId: 'OP-0417',
      override: {
        supervisorId: 'OP-0901',
        reason: 'Customer approved',
        zone: 'OVER',
        authorisedAt: NOW.toISOString(),
      },
    });
    expect(t.w.ctx.records.findBySessionAndSequence(t.sid, 3)).toEqual(record);
    expect(states(t, t.sid)).toEqual(['DONE', 'DONE', 'DONE', 'ACTIVE', 'PENDING']);
    expect(session.activeSequence).toBe(4);

    const events = t.w.auditLog.listForSession(t.sid);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'OVERRIDE',
      actorId: 'OP-0901',
      sessionId: t.sid,
      detail: {
        sequence: 3,
        dyestuffCode: 'DYE-4471',
        recordId: record.recordId,
        actual: g('96.4'),
        target: g('94.0'),
        zone: 'OVER',
        surplus: { amount: g('2.4'), percent: '2.6' },
        reason: 'Customer approved',
        operatorId: 'OP-0417',
      },
    });
  });

  it.each([
    ['93.0', 'NEAR'],
    ['93.4', 'NEAR'],
    ['84.6', 'NEAR'],
    ['84.5', 'UNDER'],
    ['50.0', 'UNDER'],
    ['0.1', 'UNDER'],
  ])('Yellow at %s g (%s): OVERRIDDEN with the zone and no surplus (TD-15)', async (w, zone) => {
    const t = await toYellow();
    await ready(t, 3, g(w));
    const { record } = await t.w.override.override(t.sid, 3, SUP);
    expect(record.result).toBe('OVERRIDDEN');
    expect(record.surplus).toBeNull();
    expect(record.override?.zone).toBe(zone);
    expect(record.actual).toEqual(g(w));
  });

  it('94.6 g — just over the band — is overridable and carries the surplus', async () => {
    const t = await toYellow();
    await ready(t, 3, g('94.6'));
    const { record } = await t.w.override.override(t.sid, 3, SUP);
    expect(record.surplus).toEqual({ amount: g('0.6'), percent: '0.6' });
  });

  it('works in kg: Sodium Sulphate at 24.600 kg → surplus +0.6 kg (+2.5 %)', async () => {
    const t = await toYellow();
    await confirmOnTarget(t, 3);
    await ready(t, 4, kg('24.600'));
    const { record } = await t.w.override.override(t.sid, 4, SUP);
    expect(record).toMatchObject({
      result: 'OVERRIDDEN',
      actual: kg('24.600'),
      surplus: { amount: kg('0.6'), percent: '2.5' },
      scaleId: 'scale-32kg',
    });
  });

  it('the reason is trimmed and stored as entered otherwise', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    const { record } = await t.w.override.override(t.sid, 3, {
      ...SUP,
      reason: '  Re-dye  of lot 7 ',
    });
    expect(record.override!.reason).toBe('Re-dye  of lot 7');
  });

  it('the station operator and the supervisor are both kept; they may be the same person', async () => {
    const t = await toYellow();
    t.w.identification.signIn('BDG-0901');
    await ready(t, 3, g('96.4'));
    const { record } = await t.w.override.override(t.sid, 3, SUP);
    expect(record.operatorId).toBe('OP-0901');
    expect(record.override!.supervisorId).toBe('OP-0901');
  });

  it('an override on the last component completes the batch', async () => {
    const t = await started();
    for (const seq of [1, 2, 3, 4]) await confirmOnTarget(t, seq);
    await ready(t, 5, kg('9.000'));
    const { session } = await t.w.override.override(t.sid, 5, SUP);
    expect(session.status).toBe('COMPLETED');
    expect(session.activeSequence).toBeNull();
  });

  it('no recalculation: no target, tolerance or the recipe snapshot changes (Step 24)', async () => {
    const t = await toYellow();
    const before = JSON.stringify(current(t, t.sid).snapshot().recipe);
    await ready(t, 3, g('96.4'));
    await t.w.override.override(t.sid, 3, SUP);
    expect(JSON.stringify(current(t, t.sid).snapshot().recipe)).toBe(before);
    const view = t.w.toSessionView(current(t, t.sid));
    expect(view.components.map((c) => c.target)).toEqual([
      g('1240.0'),
      g('386.0'),
      g('94.0'),
      kg('24.000'),
      kg('9.600'),
    ]);
  });

  it('the session view shows the overridden component as done with result OVERRIDDEN', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    await t.w.override.override(t.sid, 3, SUP);
    const view = t.w.toSessionView(current(t, t.sid));
    expect(view.components[2]!.confirmed).toMatchObject({
      actual: g('96.4'),
      result: 'OVERRIDDEN',
    });
    const recordView = t.w.toRecordView(t.w.ctx.records.findBySessionAndSequence(t.sid, 3)!);
    expect(recordView.override).toEqual({
      supervisor: { operatorId: 'OP-0901', name: 'Shift Supervisor A' },
      reason: 'Customer approved',
      zone: 'OVER',
      authorisedAt: NOW.toISOString(),
    });
  });

  it('reads the scale exactly once and takes no weight (ADR-7); never calls OrgaTEX (TD-1)', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    const before = t.scales.reads;
    const calls = t.orgatexCalls.length;
    await t.w.override.override(t.sid, 3, SUP);
    expect(t.scales.reads - before).toBe(1);
    expect(t.orgatexCalls).toHaveLength(calls);
    expect(t.w.override.override.length).toBe(3); // (sessionId, sequence, command) — no weight
  });
});

describe('override — refusals write nothing (invariants 22–26)', () => {
  const refused = async (t: S, seq: number, command: OverrideCommand, code: string) => {
    const before = snapshotOf(t);
    await expect(t.w.override.override(t.sid, seq, command)).rejects.toMatchObject({ code });
    expect(snapshotOf(t)).toEqual(before);
  };

  it('a blank reason → REASON_REQUIRED, before anything else', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    const reads = t.scales.reads;
    await refused(t, 3, { ...SUP, reason: '   ' }, 'REASON_REQUIRED');
    await refused(t, 3, { ...SUP, reason: '' }, 'REASON_REQUIRED');
    expect(t.scales.reads).toBe(reads);
  });

  it.each([
    ['a wrong PIN', { pin: '0000' }],
    ['an unknown badge', { supervisorBadge: 'BDG-4242' }],
    ['an operator badge (not a supervisor)', { supervisorBadge: 'BDG-0417', pin: '1234' }],
    ['an inactive badge', { supervisorBadge: 'BDG-0999' }],
  ])('%s → NOT_AUTHORISED, and the scale is never read', async (_name, patch) => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    const reads = t.scales.reads;
    await refused(t, 3, { ...SUP, ...patch }, 'NOT_AUTHORISED');
    expect(t.scales.reads).toBe(reads);
  });

  it('an operator who is signed in cannot use their own PIN as a supervisor', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    await refused(t, 3, { ...SUP, supervisorBadge: 'BDG-0417' }, 'NOT_AUTHORISED');
  });

  it('nobody signed in → NOT_SIGNED_IN', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    t.w.identification.signOut();
    await refused(t, 3, SUP, 'NOT_SIGNED_IN');
  });

  it('a locked component → IDENTITY_NOT_VERIFIED, without reading the scale', async () => {
    const t = await toYellow();
    t.scales.net = g('96.4');
    const reads = t.scales.reads;
    await refused(t, 3, SUP, 'IDENTITY_NOT_VERIFIED');
    expect(t.scales.reads).toBe(reads);
  });

  it('an unstable reading → READING_UNSTABLE', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'), false);
    await refused(t, 3, SUP, 'READING_UNSTABLE');
  });

  it.each(['0.0', '-0.5'])('nothing on the scale (%s g) → NOTHING_TO_OVERRIDE', async (w) => {
    const t = await toYellow();
    await ready(t, 3, g(w));
    await refused(t, 3, SUP, 'NOTHING_TO_OVERRIDE');
  });

  it.each(['93.5', '94.0', '94.5'])(
    'a weight within tolerance (%s g) → OVERRIDE_NOT_NEEDED',
    async (w) => {
      const t = await toYellow();
      await ready(t, 3, g(w));
      await refused(t, 3, SUP, 'OVERRIDE_NOT_NEEDED');
    },
  );

  it('scale not responding → SCALE_UNAVAILABLE; calibration expired → SCALE_CALIBRATION_EXPIRED', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    t.scales.readFails = true;
    await refused(t, 3, SUP, 'SCALE_UNAVAILABLE');
    t.scales.readFails = false;
    t.scales.set('scale-3kg', { calibrationDueAt: PAST });
    await refused(t, 3, SUP, 'SCALE_CALIBRATION_EXPIRED');
    t.scales.set('scale-3kg', { calibrationDueAt: FUTURE });
  });

  it('a done, pending or unknown component, and a suspended or completed session', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    await refused(t, 1, SUP, 'COMPONENT_ALREADY_DONE');
    await refused(t, 4, SUP, 'COMPONENT_NOT_ACTIVE');
    await refused(t, 9, SUP, 'COMPONENT_NOT_FOUND');
    await expect(t.w.override.override('nope', 3, SUP)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
    await t.w.suspension.quit(t.sid);
    await refused(t, 3, SUP, 'SESSION_NOT_IN_PROGRESS');

    const done = await started();
    for (const seq of [1, 2, 3, 4, 5]) await confirmOnTarget(done, seq);
    await refused(done, 5, SUP, 'SESSION_COMPLETED');
  });

  it('every refusal is logged with its code — never the PIN or the reason', async () => {
    const t = await toYellow();
    await ready(t, 3, g('94.0'));
    await expect(
      t.w.override.override(t.sid, 3, { ...SUP, reason: 'secret words' }),
    ).rejects.toMatchObject({ code: 'OVERRIDE_NOT_NEEDED' });
    const text = JSON.stringify(t.logs);
    expect(text).toContain('override-refused');
    expect(text).toContain('OVERRIDE_NOT_NEEDED');
    expect(text).not.toContain('2580');
    expect(text).not.toContain('secret words');
  });

  it('a successful override is logged without the PIN or the reason', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    await t.w.override.override(t.sid, 3, { ...SUP, reason: 'secret words' });
    const text = JSON.stringify(t.logs);
    expect(text).toContain('override-authorised');
    expect(text).not.toContain('2580');
    expect(text).not.toContain('secret words');
  });
});

describe('override — one atomic unit and serialisation (invariant 26, ADR-6)', () => {
  it('if the audit write fails, the record and the state change are rolled back', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    const before = snapshotOf(t);
    t.w.ctx.audit.append = () => {
      throw new Error('disk full');
    };
    await expect(t.w.override.override(t.sid, 3, SUP)).rejects.toThrow('disk full');
    expect(snapshotOf(t)).toEqual(before);
    expect(current(t, t.sid).activeSequence).toBe(3);
  });

  it('if appending the record fails, no audit event is left behind', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    t.w.ctx.records.append = () => {
      throw new Error('disk full');
    };
    await expect(t.w.override.override(t.sid, 3, SUP)).rejects.toThrow('disk full');
    expect(t.w.auditLog.listForSession(t.sid)).toEqual([]);
  });

  it('a double click is serialised: one record and one audit event, the second gets COMPONENT_ALREADY_DONE', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    const results = await Promise.allSettled([
      t.w.override.override(t.sid, 3, SUP),
      t.w.override.override(t.sid, 3, SUP),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'COMPONENT_ALREADY_DONE' });
    expect(t.w.ctx.records.listBySession(t.sid).filter((r) => r.sequence === 3)).toHaveLength(1);
    expect(t.w.auditLog.listForSession(t.sid)).toHaveLength(1);
  });

  it('confirm is still refused for every zone but OK — override is the only way (BR-07)', async () => {
    const t = await toYellow();
    for (const w of ['50.0', '93.4', '94.6', '96.4']) {
      await ready(t, 3, g(w));
      await expect(t.w.confirmation.confirm(t.sid, 3)).rejects.toMatchObject({
        code: 'TOLERANCE_VIOLATION',
      });
    }
    expect(t.w.ctx.records.listBySession(t.sid).map((r) => r.sequence)).toEqual([1, 2]);
  });
});

describe('recovery without a supervisor (Step 24, invariant 28)', () => {
  it('an over-dosed weight is not remembered: when the excess is removed it can be confirmed', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    await expect(t.w.confirmation.confirm(t.sid, 3)).rejects.toMatchObject({
      code: 'TOLERANCE_VIOLATION',
    });
    t.scales.net = g('94.1');
    const { record } = await t.w.confirmation.confirm(t.sid, 3);
    expect(record).toMatchObject({ result: 'IN_TOLERANCE', surplus: null, override: null });
    expect(t.w.auditLog.listForSession(t.sid)).toEqual([]);
  });

  it('re-tare restarts the component and needs no supervisor, record or audit event', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    t.scales.nextTare = g('214.0');
    await t.w.retare.retare(t.sid, 3);
    expect(t.w.ctx.records.listBySession(t.sid)).toHaveLength(2);
    expect(t.w.auditLog.listForSession(t.sid)).toEqual([]);
  });
});

describe('evaluation — what the station would decide now (story 014)', () => {
  it.each([
    ['0.0', 'UNDER', false, false, null],
    ['50.0', 'UNDER', false, true, null],
    ['93.4', 'NEAR', false, true, null],
    ['93.5', 'OK', true, false, null],
    ['94.5', 'OK', true, false, null],
    ['94.6', 'OVER', false, true, { amount: g('0.6'), percent: '0.6' }],
    ['96.4', 'OVER', false, true, { amount: g('2.4'), percent: '2.6' }],
  ] as const)(
    'Yellow at %s g: %s, confirmable=%s, overridable=%s',
    async (w, zone, confirmable, overridable, surplus) => {
      const t = await toYellow();
      await ready(t, 3, g(w));
      const e = await t.w.evaluation.evaluate(t.sid, 3);
      expect(e).toEqual({
        weight: g(w),
        stable: true,
        zone,
        lower: g('93.5'),
        upper: g('94.5'),
        surplus,
        confirmable,
        overridable,
      });
    },
  );

  it('an unstable reading is reported as such and is neither confirmable nor overridable', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'), false);
    const e = await t.w.evaluation.evaluate(t.sid, 3);
    expect(e).toMatchObject({
      stable: false,
      zone: 'OVER',
      confirmable: false,
      overridable: false,
    });
  });

  it('is read-only and needs no signed-in operator', async () => {
    const t = await toYellow();
    await ready(t, 3, g('96.4'));
    t.w.identification.signOut();
    const before = snapshotOf(t);
    await t.w.evaluation.evaluate(t.sid, 3);
    expect(snapshotOf(t)).toEqual(before);
  });

  it('refuses a locked component, a dead scale and an unknown session like confirm does', async () => {
    const t = await toYellow();
    await expect(t.w.evaluation.evaluate(t.sid, 3)).rejects.toMatchObject({
      code: 'IDENTITY_NOT_VERIFIED',
    });
    await ready(t, 3, g('96.4'));
    t.scales.readFails = true;
    await expect(t.w.evaluation.evaluate(t.sid, 3)).rejects.toMatchObject({
      code: 'SCALE_UNAVAILABLE',
    });
    await expect(t.w.evaluation.evaluate('nope', 3)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('in kg: Sodium Sulphate at 24.600 kg → +0.6 kg (+2.5 %)', async () => {
    const t = await toYellow();
    await confirmOnTarget(t, 3);
    await ready(t, 4, kg('24.600'));
    const e = await t.w.evaluation.evaluate(t.sid, 4);
    expect(e).toMatchObject({
      zone: 'OVER',
      lower: kg('23.88'),
      upper: kg('24.12'),
      surplus: { amount: kg('0.6'), percent: '2.5' },
    });
  });
});
