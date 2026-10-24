/**
 * Preparation use cases with fake devices: scale selection, identity unlock, lot, container,
 * supervisor reselection (ddd-01/02, ADR-4..6). Real SQLite (in memory) and the real MaterialService.
 */
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecipeResponse } from '../../../../shared/batches';
import type { Quantity } from '../../../../shared/quantity';
import { openWeighingDb } from '../../../db/weighingms/db';
import {
  LotNotFoundError,
  OrgatexUnavailableError,
  ScaleNotFoundError,
  ScaleUnavailableError,
} from '../../../errors';
import type { OrgatexPort } from '../../../integrations/orgatex/orgatex-port';
import type { ScaleInfo, ScalePort, TareOptions } from '../../../integrations/scale/scale-port';
import type { BatchService } from '../../batches/batch-service';
import { DrizzleContainerRepository } from '../../materials/container-repository';
import { MaterialService } from '../../materials/material-service';
import { createWeighingModule } from '../module';
import {
  readStationSeed,
  seedContainersIfEmpty,
  seedOperatorsIfEmpty,
} from '../infrastructure/seed';

const NOW = new Date('2026-10-24T07:00:00Z');
const FUTURE = '2027-03-31T00:00:00Z';
const PAST = '2026-10-01T00:00:00Z';

const component = (
  sequence: number,
  code: string,
  name: string,
  target: Quantity,
  tolerance: Quantity,
  suggestedLotId: string,
) => ({
  sequence,
  dyestuff: {
    code,
    name,
    shortName: name,
    colourHex: '#000',
    type: code.startsWith('AUX') ? 'AUXILIARY' : 'DYE',
  },
  target,
  tolerance,
  barMax: target,
  suggestedLotId,
});
const g = (value: string): Quantity => ({ value, unit: 'g' });
const kg = (value: string): Quantity => ({ value, unit: 'kg' });

const RECIPE: RecipeResponse = {
  batchId: 'B-24187',
  recipeId: 'RCP-TEAL-4C',
  shade: 'Teal 4C',
  version: '1',
  components: [
    component(1, 'DYE-1180', 'Blue', g('1240.0'), g('6.0'), '2026-0341'),
    component(2, 'DYE-2204', 'Red', g('386.0'), g('2.0'), '2026-0298'),
    component(3, 'DYE-4471', 'Yellow', g('94.0'), g('0.5'), '2026-0387'),
    component(4, 'AUX-0101', 'Sodium Sulphate', kg('24.000'), kg('0.120'), '2026-0112'),
    component(5, 'AUX-0107', 'Soda Ash', kg('9.600'), kg('0.060'), '2026-0155'),
  ],
};

const LOTS: Record<string, string> = {
  '2026-0341': 'DYE-1180',
  '2026-0387': 'DYE-4471',
  '2026-0402': 'DYE-4471',
};

class FakeScales implements ScalePort {
  scales: ScaleInfo[] = [
    {
      scaleId: 'scale-3kg',
      class: 'PRECISION',
      capacity: kg('3'),
      unit: 'g',
      resolution: g('0.1'),
      calibrationDueAt: FUTURE,
      connected: true,
    },
    {
      scaleId: 'scale-32kg',
      class: 'FLOOR',
      capacity: kg('32'),
      unit: 'kg',
      resolution: kg('0.001'),
      calibrationDueAt: FUTURE,
      connected: true,
    },
  ];
  tares: { scaleId: string; options?: TareOptions }[] = [];
  listFails = false;
  tareFails = false;
  /** Awaited inside tare() — lets a test hold a tare in flight. */
  tareGate: Promise<void> | null = null;

  async listScales() {
    if (this.listFails) throw new ScaleUnavailableError('*', 'down');
    return this.scales.map((s) => ({ ...s }));
  }
  async getScale(scaleId: string) {
    const s = this.scales.find((x) => x.scaleId === scaleId);
    if (!s) throw new ScaleNotFoundError(scaleId);
    return { ...s };
  }
  async read(): Promise<never> {
    throw new Error('not used');
  }
  async tare(scaleId: string, options?: TareOptions) {
    await this.tareGate;
    if (this.tareFails) throw new ScaleUnavailableError(scaleId, 'tare failed');
    this.tares.push({ scaleId, ...(options ? { options } : {}) });
    return options?.containerTare ?? g('0.0');
  }
  set(scaleId: string, patch: Partial<ScaleInfo>) {
    Object.assign(
      this.scales.find((s) => s.scaleId === scaleId)!,
      patch,
    );
  }
}

interface Logged {
  obj: object;
}
let close: (() => void) | undefined;
afterEach(() => close?.());

function setup() {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  const seed = readStationSeed(path.resolve('data/seed/station-seed.json'));
  seedOperatorsIfEmpty(opened.db, seed);
  seedContainersIfEmpty(opened.db, seed);
  const scales = new FakeScales();
  const findLotCalls: string[] = [];
  let orgatexDown = false;
  const orgatex = {
    async findLot(lotId: string) {
      findLotCalls.push(lotId);
      if (orgatexDown) throw new OrgatexUnavailableError('down');
      const dyestuffCode = LOTS[lotId];
      if (!dyestuffCode) throw new LotNotFoundError(lotId);
      return { lotId, dyestuffCode };
    },
    async setBatchStatus() {},
  } as unknown as OrgatexPort;
  const batches = {
    async requireWeighable() {
      return {};
    },
    async getRecipe() {
      return RECIPE;
    },
  } as unknown as BatchService;
  const logs: Logged[] = [];
  const logger = {
    info: (obj: object) => logs.push({ obj }),
    warn: (obj: object) => logs.push({ obj }),
  };
  let n = 0;
  const w = createWeighingModule({
    db: opened.db,
    stationId: 'STN-01',
    batches,
    orgatex,
    scales,
    materials: new MaterialService(orgatex, new DrizzleContainerRepository(opened.db)),
    logger,
    now: () => NOW,
    newId: () => `ID-${++n}`,
  });
  return {
    w,
    scales,
    logs,
    findLotCalls,
    orgatexOffline: () => (orgatexDown = true),
  };
}

async function started() {
  const t = setup();
  t.w.identification.signIn('BDG-0417');
  const { session } = await t.w.starter.startOrResume('B-24187');
  return { ...t, sid: session.sessionId };
}

const active = (t: { w: ReturnType<typeof setup>['w'] }, sid: string, seq: number) =>
  t.w.ctx.sessions.findById(sid)!.snapshot().components[seq - 1]!;
const stateOf = (t: { w: ReturnType<typeof setup>['w'] }, sid: string, seq: number) =>
  t.w.ctx.sessions.findById(sid)!.preparationState(seq);
const SUPERVISOR = ['BDG-0901', '2580'] as const;

describe('scale assignment at activation (story 005, model invariant 8)', () => {
  it('a new session assigns component 1 (Blue) to scale-3kg, AUTO, with its requirement', async () => {
    const t = await started();
    expect(active(t, t.sid, 1).scale).toEqual({
      scaleId: 'scale-3kg',
      mode: 'AUTO',
      reason: null,
      requirement: { value: '1460', unit: 'g' },
    });
  });

  it.each([
    [2, 'scale-3kg', '602', 'g'],
    [3, 'scale-3kg', '308.5', 'g'],
    [4, 'scale-32kg', '25.97', 'kg'],
    [5, 'scale-32kg', '11.51', 'kg'],
  ])(
    'activating component %i selects %s (requirement %s %s)',
    async (seq, scaleId, value, unit) => {
      const t = await started();
      await t.w.activation.activate(t.sid, seq);
      expect(active(t, t.sid, seq).scale).toMatchObject({
        scaleId,
        mode: 'AUTO',
        requirement: { value, unit },
      });
    },
  );

  it('switching component discards the previous component’s scale and preparation', async () => {
    const t = await started();
    await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
    await t.w.activation.activate(t.sid, 4);
    const snap = t.w.ctx.sessions.findById(t.sid)!.snapshot().components;
    expect(snap[0]).toMatchObject({ state: 'PENDING', scale: null, preparation: null });
  });

  it('with the small scale expired or offline, the next suitable scale is chosen (story 007)', async () => {
    const t = await started();
    t.scales.set('scale-3kg', { calibrationDueAt: PAST });
    await t.w.activation.activate(t.sid, 3);
    expect(active(t, t.sid, 3).scale).toMatchObject({ scaleId: 'scale-32kg', mode: 'AUTO' });
    t.scales.set('scale-3kg', { calibrationDueAt: FUTURE, connected: false });
    await t.w.activation.activate(t.sid, 2);
    expect(active(t, t.sid, 2).scale).toMatchObject({ scaleId: 'scale-32kg' });
  });

  it('no usable scale → the component is still activated, with NO_SUITABLE_SCALE', async () => {
    const t = await started();
    t.scales.set('scale-3kg', { connected: false });
    t.scales.set('scale-32kg', { calibrationDueAt: PAST });
    const session = await t.w.activation.activate(t.sid, 3);
    expect(session.activeSequence).toBe(3);
    expect(active(t, t.sid, 3).scale).toMatchObject({ scaleId: null, reason: 'NO_SUITABLE_SCALE' });
  });

  it('the scale list failing does not stop a session from starting or a component from activating', async () => {
    const t = setup();
    t.scales.listFails = true;
    t.w.identification.signIn('BDG-0417');
    const { session } = await t.w.starter.startOrResume('B-24187');
    expect(session.activeSequence).toBe(1);
    expect(active(t, session.sessionId, 1).scale).toMatchObject({
      scaleId: null,
      reason: 'NO_SUITABLE_SCALE',
    });
    await t.w.activation.activate(session.sessionId, 2);
    expect(active(t, session.sessionId, 2).scale?.scaleId).toBeNull();
  });
});

describe('verifyIdentity and unlock (story 004)', () => {
  it('Yellow + DYE-4471 → lot 2026-0387, container C-12, tared with the container, UNLOCKED, no OrgaTEX call', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    const { session, issue } = await t.w.preparation.verifyIdentity(t.sid, 3, ' dye-4471 ');
    expect(issue).toBeUndefined();
    const c = session.snapshot().components[2]!;
    expect(session.preparationState(3)).toBe('UNLOCKED');
    expect(c.preparation).toMatchObject({
      lot: { lotId: '2026-0387', source: 'DEFAULT' },
      container: { containerId: 'C-12', source: 'DEFAULT' },
      tareApplied: g('214.0'),
    });
    expect(t.scales.tares).toEqual([
      { scaleId: 'scale-3kg', options: { containerTare: g('214.0') } },
    ]);
    expect(t.findLotCalls).toEqual([]);
  });

  it('works while OrgaTEX is offline (defaults need no OrgaTEX call)', async () => {
    const t = await started();
    t.orgatexOffline();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    expect(stateOf(t, t.sid, 3)).toBe('UNLOCKED');
  });

  it('Sodium Sulphate → scale-32kg tared with the 1.850 kg drum D-03', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 4);
    await t.w.preparation.verifyIdentity(t.sid, 4, 'AUX-0101');
    expect(t.scales.tares[0]).toEqual({
      scaleId: 'scale-32kg',
      options: { containerTare: kg('1.850') },
    });
    expect(active(t, t.sid, 4).preparation).toMatchObject({
      container: { containerId: 'D-03' },
      lot: { lotId: '2026-0112' },
    });
  });

  it('another dyestuff → WRONG_DYESTUFF; nothing is saved and the scale is not tared', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    const before = t.w.ctx.sessions.findById(t.sid)!.snapshot();
    await expect(t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-2204')).rejects.toMatchObject({
      code: 'WRONG_DYESTUFF',
      httpStatus: 422,
    });
    expect(t.w.ctx.sessions.findById(t.sid)!.snapshot()).toEqual(before);
    expect(t.scales.tares).toEqual([]);
  });

  it('no operator signed in → NOT_SIGNED_IN', async () => {
    const t = await started();
    t.w.identification.signOut();
    await expect(t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180')).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
    });
  });

  it('unknown session, unknown component, pending component → 404 / 404 / COMPONENT_NOT_ACTIVE', async () => {
    const t = await started();
    await expect(t.w.preparation.verifyIdentity('nope', 1, 'DYE-1180')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
    await expect(t.w.preparation.verifyIdentity(t.sid, 9, 'DYE-1180')).rejects.toMatchObject({
      code: 'COMPONENT_NOT_FOUND',
    });
    await expect(t.w.preparation.verifyIdentity(t.sid, 2, 'DYE-2204')).rejects.toMatchObject({
      code: 'COMPONENT_NOT_ACTIVE',
    });
  });

  it('a second scan of the same dyestuff after unlock does not tare again', async () => {
    const t = await started();
    await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
    await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
    expect(t.scales.tares).toHaveLength(1);
  });

  describe('scale unavailable at unlock — identity kept, tare pending (ADR-5)', () => {
    it('tare failure → accepted, AWAITING_TARE with the cause; a later scan retries and unlocks', async () => {
      const t = await started();
      t.scales.tareFails = true;
      const first = await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
      expect(first.issue).toMatchObject({ code: 'SCALE_UNAVAILABLE' });
      expect(first.session.preparationState(1)).toBe('AWAITING_TARE');
      expect(active(t, t.sid, 1).preparation!.identityVerifiedAt).not.toBeNull();
      t.scales.tareFails = false;
      const retry = await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
      expect(retry.issue).toBeUndefined();
      expect(retry.session.preparationState(1)).toBe('UNLOCKED');
    });

    it('assigned scale expired since activation → the automatic assignment moves to scale-32kg', async () => {
      const t = await started();
      t.scales.set('scale-3kg', { calibrationDueAt: PAST });
      const { session, issue } = await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
      expect(issue).toBeUndefined();
      expect(session.snapshot().components[0]!.scale).toMatchObject({
        scaleId: 'scale-32kg',
        mode: 'AUTO',
      });
      expect(t.scales.tares[0]!.scaleId).toBe('scale-32kg');
    });

    it('no usable scale → NO_SUITABLE_SCALE issue, identity verified, nothing tared', async () => {
      const t = await started();
      t.scales.set('scale-3kg', { connected: false });
      t.scales.set('scale-32kg', { connected: false });
      const { session, issue } = await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
      expect(issue).toMatchObject({ code: 'NO_SUITABLE_SCALE' });
      expect(session.preparationState(1)).toBe('AWAITING_TARE');
      expect(t.scales.tares).toEqual([]);
    });
  });
});

describe('lot (FR-8)', () => {
  it('a valid scanned lot replaces the default (marked SCANNED) and keeps the tare', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    const { session } = await t.w.preparation.setLot(t.sid, 3, '2026-0402');
    expect(session.snapshot().components[2]!.preparation!.lot).toEqual({
      lotId: '2026-0402',
      source: 'SCANNED',
    });
    expect(session.preparationState(3)).toBe('UNLOCKED');
    expect(t.scales.tares).toHaveLength(1);
  });

  it('a lot of another dyestuff → LOT_MISMATCH; unknown lot → LOT_NOT_FOUND; nothing changes', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    await expect(t.w.preparation.setLot(t.sid, 3, '2026-0341')).rejects.toMatchObject({
      code: 'LOT_MISMATCH',
    });
    await expect(t.w.preparation.setLot(t.sid, 3, '9999-9999')).rejects.toMatchObject({
      code: 'LOT_NOT_FOUND',
    });
    expect(active(t, t.sid, 3).preparation!.lot).toEqual({ lotId: '2026-0387', source: 'DEFAULT' });
  });

  it('OrgaTEX offline → ORGATEX_UNAVAILABLE for a scanned lot; the default lot stays in force', async () => {
    const t = await started();
    await t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
    t.orgatexOffline();
    await expect(t.w.preparation.setLot(t.sid, 1, '2026-0341')).rejects.toMatchObject({
      code: 'ORGATEX_UNAVAILABLE',
    });
    expect(active(t, t.sid, 1).preparation!.lot).toEqual({ lotId: '2026-0341', source: 'DEFAULT' });
    expect(stateOf(t, t.sid, 1)).toBe('UNLOCKED');
  });

  it('a lot may be scanned before the dyestuff; it is kept when the dyestuff is verified', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.setLot(t.sid, 3, '2026-0402');
    expect(stateOf(t, t.sid, 3)).toBe('AWAITING_IDENTITY');
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    expect(active(t, t.sid, 3).preparation!.lot).toEqual({ lotId: '2026-0402', source: 'SCANNED' });
    expect(stateOf(t, t.sid, 3)).toBe('UNLOCKED');
  });
});

describe('container (FR-9, FR-10)', () => {
  it('replacing the container of an unlocked component re-tares with the new container', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    const { session } = await t.w.preparation.setContainer(t.sid, 3, ' c-09 ');
    expect(session.snapshot().components[2]!.preparation!.container).toMatchObject({
      containerId: 'C-09',
      source: 'SCANNED',
    });
    expect(session.preparationState(3)).toBe('UNLOCKED');
    expect(t.scales.tares).toHaveLength(2);
  });

  it('unknown / out-of-service container → refused, nothing changes, no tare', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    await expect(t.w.preparation.setContainer(t.sid, 3, 'C-99')).rejects.toMatchObject({
      code: 'CONTAINER_UNKNOWN',
    });
    await expect(t.w.preparation.setContainer(t.sid, 3, 'C-13')).rejects.toMatchObject({
      code: 'CONTAINER_OUT_OF_SERVICE',
    });
    expect(active(t, t.sid, 3).preparation!.container!.containerId).toBe('C-12');
    expect(t.scales.tares).toHaveLength(1);
  });

  it('all-or-nothing: if the re-tare fails, the old container and tare stay', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    t.scales.tareFails = true;
    await expect(t.w.preparation.setContainer(t.sid, 3, 'C-09')).rejects.toMatchObject({
      code: 'SCALE_UNAVAILABLE',
    });
    const prep = active(t, t.sid, 3).preparation!;
    expect(prep.container!.containerId).toBe('C-12');
    expect(prep.tareApplied).toEqual(g('214.0'));
  });

  it('before unlock: the container is kept and unlocking continues from there', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.setContainer(t.sid, 3, 'C-09');
    expect(stateOf(t, t.sid, 3)).toBe('AWAITING_IDENTITY');
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    expect(active(t, t.sid, 3).preparation!.container!.containerId).toBe('C-09');
    expect(t.scales.tares[0]!.options!.containerTare).toEqual(g('214.0'));
  });

  it('a supervisor-chosen scale too small for the new container → SCALE_CAPACITY_INSUFFICIENT, nothing changes', async () => {
    const t = await started();
    await t.w.preparation.reselectScale(t.sid, 1, 'scale-3kg', ...SUPERVISOR);
    // Blue with the 1.850 kg drum: 1240.0 + 6.0 + 1850.0 = 3096.0 g, over the 3 kg capacity
    await expect(t.w.preparation.setContainer(t.sid, 1, 'D-03')).rejects.toMatchObject({
      code: 'SCALE_CAPACITY_INSUFFICIENT',
      httpStatus: 422,
    });
    expect(active(t, t.sid, 1).preparation!.container).toBeNull();
    expect(active(t, t.sid, 1).scale).toMatchObject({ scaleId: 'scale-3kg', mode: 'MANUAL' });
  });

  it('an automatic scale is re-selected when the container makes it too small', async () => {
    const t = await started();
    // Blue with C-09 → scale-3kg (1460 g); a drum raises the requirement above 3 kg
    await t.w.preparation.setContainer(t.sid, 1, 'D-03');
    expect(active(t, t.sid, 1).scale).toMatchObject({ scaleId: 'scale-32kg', mode: 'AUTO' });
  });
});

describe('supervisor reselection (story 006, FR-12, NFR-14)', () => {
  it('a supervisor’s badge + PIN reselects the scale: MANUAL, one SCALE_RESELECT audit event naming the supervisor', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    const { session } = await t.w.preparation.reselectScale(
      t.sid,
      3,
      'scale-32kg',
      ' bdg-0901 ',
      '2580',
    );
    expect(session.snapshot().components[2]!.scale).toMatchObject({
      scaleId: 'scale-32kg',
      mode: 'MANUAL',
    });
    const events = t.w.auditLog.listForSession(t.sid);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'SCALE_RESELECT',
      actorId: 'OP-0901',
      sessionId: t.sid,
      detail: {
        sequence: 3,
        dyestuffCode: 'DYE-4471',
        fromScaleId: 'scale-3kg',
        fromMode: 'AUTO',
        toScaleId: 'scale-32kg',
      },
    });
  });

  it.each([
    ['an operator’s badge', 'BDG-0417', '2580'],
    ['an unknown badge', 'BDG-7777', '2580'],
    ['the inactive badge', 'BDG-0999', '2580'],
    ['a wrong PIN', 'BDG-0901', '0000'],
  ])('%s → NOT_AUTHORISED (403), nothing changes, no audit event', async (_n, badge, pin) => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await expect(
      t.w.preparation.reselectScale(t.sid, 3, 'scale-32kg', badge, pin),
    ).rejects.toMatchObject({
      code: 'NOT_AUTHORISED',
      httpStatus: 403,
      message: 'Supervisor authorisation failed',
    });
    expect(active(t, t.sid, 3).scale).toMatchObject({ scaleId: 'scale-3kg', mode: 'AUTO' });
    expect(t.w.auditLog.listForSession(t.sid)).toEqual([]);
  });

  it('the PIN never appears in the logs', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.reselectScale(t.sid, 3, 'scale-32kg', 'BDG-0901', '2580');
    await t.w.preparation
      .reselectScale(t.sid, 3, 'scale-3kg', 'BDG-0901', '1111')
      .catch(() => undefined);
    expect(JSON.stringify(t.logs)).not.toContain('2580');
    expect(JSON.stringify(t.logs)).not.toContain('1111');
    expect(JSON.stringify(t.w.auditLog.listForSession(t.sid))).not.toContain('2580');
  });

  it('a scale with too little capacity → SCALE_CAPACITY_INSUFFICIENT (Sodium Sulphate on 3 kg)', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 4);
    await expect(
      t.w.preparation.reselectScale(t.sid, 4, 'scale-3kg', ...SUPERVISOR),
    ).rejects.toMatchObject({
      code: 'SCALE_CAPACITY_INSUFFICIENT',
      httpStatus: 422,
    });
    expect(t.w.auditLog.listForSession(t.sid)).toEqual([]);
  });

  it('unknown scale → SCALE_NOT_FOUND; expired → SCALE_CALIBRATION_EXPIRED; offline → SCALE_UNAVAILABLE', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await expect(
      t.w.preparation.reselectScale(t.sid, 3, 'scale-9kg', ...SUPERVISOR),
    ).rejects.toMatchObject({ code: 'SCALE_NOT_FOUND' });
    t.scales.set('scale-32kg', { calibrationDueAt: PAST });
    await expect(
      t.w.preparation.reselectScale(t.sid, 3, 'scale-32kg', ...SUPERVISOR),
    ).rejects.toMatchObject({ code: 'SCALE_CALIBRATION_EXPIRED' });
    t.scales.set('scale-32kg', { calibrationDueAt: FUTURE, connected: false });
    await expect(
      t.w.preparation.reselectScale(t.sid, 3, 'scale-32kg', ...SUPERVISOR),
    ).rejects.toMatchObject({ code: 'SCALE_UNAVAILABLE' });
  });

  it('on an unlocked component the new scale is tared (all-or-nothing) and stays unlocked', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    const { session } = await t.w.preparation.reselectScale(t.sid, 3, 'scale-32kg', ...SUPERVISOR);
    expect(session.preparationState(3)).toBe('UNLOCKED');
    expect(t.scales.tares.map((x) => x.scaleId)).toEqual(['scale-3kg', 'scale-32kg']);
  });

  it('if the new scale cannot be tared, the reselection is refused and nothing is saved or audited', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    await t.w.preparation.verifyIdentity(t.sid, 3, 'DYE-4471');
    t.scales.tareFails = true;
    await expect(
      t.w.preparation.reselectScale(t.sid, 3, 'scale-32kg', ...SUPERVISOR),
    ).rejects.toMatchObject({ code: 'SCALE_UNAVAILABLE' });
    expect(active(t, t.sid, 3).scale).toMatchObject({ scaleId: 'scale-3kg', mode: 'AUTO' });
    expect(stateOf(t, t.sid, 3)).toBe('UNLOCKED');
    expect(t.w.auditLog.listForSession(t.sid)).toEqual([]);
  });

  it('reselection and its audit event are one transaction: if the audit write fails, the reselection is not saved', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 3);
    const original = t.w.ctx.audit.append.bind(t.w.ctx.audit);
    t.w.ctx.audit.append = () => {
      throw new Error('disk full');
    };
    await expect(
      t.w.preparation.reselectScale(t.sid, 3, 'scale-32kg', ...SUPERVISOR),
    ).rejects.toThrow('disk full');
    t.w.ctx.audit.append = original;
    expect(active(t, t.sid, 3).scale).toMatchObject({ scaleId: 'scale-3kg', mode: 'AUTO' });
    expect(t.w.auditLog.listForSession(t.sid)).toEqual([]);
  });

  it('before the dyestuff is verified, reselection only records the scale (no tare)', async () => {
    const t = await started();
    await t.w.preparation.reselectScale(t.sid, 1, 'scale-32kg', ...SUPERVISOR);
    expect(t.scales.tares).toEqual([]);
    expect(stateOf(t, t.sid, 1)).toBe('AWAITING_IDENTITY');
  });

  it('works when there was no suitable scale (a supervisor may still choose one)', async () => {
    const t = await started();
    t.scales.set('scale-3kg', { connected: false });
    await t.w.activation.activate(t.sid, 3);
    t.scales.set('scale-32kg', { connected: false });
    await t.w.activation.activate(t.sid, 2);
    t.scales.set('scale-32kg', { connected: true });
    const { session } = await t.w.preparation.reselectScale(t.sid, 2, 'scale-32kg', ...SUPERVISOR);
    expect(session.snapshot().components[1]!.scale).toMatchObject({
      scaleId: 'scale-32kg',
      mode: 'MANUAL',
    });
  });
});

describe('scale options (FR-12: only scales with sufficient capacity are offered)', () => {
  it('reports fit, usability, state and the selected scale for the active component', async () => {
    const t = await started();
    await t.w.activation.activate(t.sid, 4);
    t.scales.set('scale-3kg', { connected: false });
    const options = await t.w.preparation.scaleOptions(t.sid, 4);
    expect(options.requirement).toEqual(kg('25.97'));
    expect(options.items).toEqual([
      {
        scaleId: 'scale-3kg',
        capacity: kg('3'),
        fits: false,
        usable: false,
        state: 'OFFLINE',
        selected: false,
      },
      {
        scaleId: 'scale-32kg',
        capacity: kg('32'),
        fits: true,
        usable: true,
        state: 'READY',
        selected: true,
      },
    ]);
  });
  it('refuses a component that is not active', async () => {
    const t = await started();
    await expect(t.w.preparation.scaleOptions(t.sid, 2)).rejects.toMatchObject({
      code: 'COMPONENT_NOT_ACTIVE',
    });
  });
});

describe('serialised preparation (ADR-6)', () => {
  it('a double scan of the dyestuff while the tare is in flight tares only once', async () => {
    const t = await started();
    let release!: () => void;
    t.scales.tareGate = new Promise<void>((resolve) => (release = resolve));
    const a = t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
    const b = t.w.preparation.verifyIdentity(t.sid, 1, 'DYE-1180');
    await new Promise((r) => setTimeout(r, 20));
    expect(t.scales.tares).toEqual([]); // first tare still in flight, second call waiting
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(t.scales.tares).toHaveLength(1);
    expect(ra.session.preparationState(1)).toBe('UNLOCKED');
    expect(rb.session.preparationState(1)).toBe('UNLOCKED');
  });
});
