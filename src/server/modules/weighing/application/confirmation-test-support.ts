/**
 * Test support for the confirmation, override and evaluation tests (bolts 010 and 012): real SQLite
 * (in memory), real MaterialService, fake ScalePort and OrgaTEX port.
 */
import path from 'node:path';
import type { RecipeResponse } from '../../../../shared/batches';
import type { Quantity } from '../../../../shared/quantity';
import { openWeighingDb } from '../../../db/weighingms/db';
import { LotNotFoundError, ScaleNotFoundError, ScaleUnavailableError } from '../../../errors';
import type { OrgatexPort } from '../../../integrations/orgatex/orgatex-port';
import type { ScaleInfo, ScalePort, TareOptions } from '../../../integrations/scale/scale-port';
import type { BatchService } from '../../batches/batch-service';
import { DrizzleContainerRepository } from '../../materials/container-repository';
import { MaterialService } from '../../materials/material-service';
import {
  readStationSeed,
  seedContainersIfEmpty,
  seedOperatorsIfEmpty,
} from '../infrastructure/seed';
import { createWeighingModule } from '../module';

export const NOW = new Date('2026-10-25T07:00:00Z');
export const FUTURE = '2027-03-31T00:00:00Z';
export const PAST = '2026-10-01T00:00:00Z';
export const g = (value: string): Quantity => ({ value, unit: 'g' });
export const kg = (value: string): Quantity => ({ value, unit: 'kg' });

export const comp = (
  sequence: number,
  code: string,
  name: string,
  target: Quantity,
  tolerance: Quantity,
  lot: string,
) => ({
  sequence,
  dyestuff: { code, name, shortName: name, colourHex: '#000', type: 'DYE' },
  target,
  tolerance,
  barMax: target,
  suggestedLotId: lot,
});
export const RECIPE: RecipeResponse = {
  batchId: 'B-24187',
  recipeId: 'RCP-TEAL-4C',
  shade: 'Teal 4C',
  version: '1',
  components: [
    comp(1, 'DYE-1180', 'Blue', g('1240.0'), g('6.0'), '2026-0341'),
    comp(2, 'DYE-2204', 'Red', g('386.0'), g('2.0'), '2026-0298'),
    comp(3, 'DYE-4471', 'Yellow', g('94.0'), g('0.5'), '2026-0387'),
    comp(4, 'AUX-0101', 'Sodium Sulphate', kg('24.000'), kg('0.120'), '2026-0112'),
    comp(5, 'AUX-0107', 'Soda Ash', kg('9.600'), kg('0.060'), '2026-0155'),
  ],
};
export const CODES = ['DYE-1180', 'DYE-2204', 'DYE-4471', 'AUX-0101', 'AUX-0107'];
/** A weight in the middle of each component's band, in the unit of the scale it is weighed on. */
export const TARGETS = [g('1240.0'), g('386.0'), g('94.0'), kg('24.000'), kg('9.600')];

export class FakeScales implements ScalePort {
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
  net: Quantity = g('0.0');
  stable = true;
  readFails = false;
  tareFails = false;
  reads = 0;
  tares: { scaleId: string; options?: TareOptions }[] = [];
  nextTare: Quantity | null = null;

  async listScales() {
    return this.scales.map((s) => ({ ...s }));
  }
  async getScale(scaleId: string) {
    const s = this.scales.find((x) => x.scaleId === scaleId);
    if (!s) throw new ScaleNotFoundError(scaleId);
    return { ...s };
  }
  async read(scaleId: string) {
    this.reads += 1;
    if (this.readFails) throw new ScaleUnavailableError(scaleId, 'no reading');
    return { net: this.net, stable: this.stable, at: NOW.toISOString() };
  }
  async tare(scaleId: string, options?: TareOptions) {
    if (this.tareFails) throw new ScaleUnavailableError(scaleId, 'tare failed');
    this.tares.push({ scaleId, ...(options ? { options } : {}) });
    return this.nextTare ?? options?.containerTare ?? g('0.0');
  }
  set(scaleId: string, patch: Partial<ScaleInfo>) {
    Object.assign(
      this.scales.find((s) => s.scaleId === scaleId)!,
      patch,
    );
  }
}

let close: (() => void) | undefined;
/** Call from `afterEach` in every test file that uses `setup`. */
export const closeDb = () => close?.();

export function setup() {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  const seed = readStationSeed(path.resolve('data/seed/station-seed.json'));
  seedOperatorsIfEmpty(opened.db, seed);
  seedContainersIfEmpty(opened.db, seed);
  const scales = new FakeScales();
  const orgatexCalls: string[] = [];
  const orgatex = {
    async findLot(lotId: string) {
      orgatexCalls.push(`findLot:${lotId}`);
      throw new LotNotFoundError(lotId);
    },
    async setBatchStatus(id: string, status: string) {
      orgatexCalls.push(`setBatchStatus:${id}:${status}`);
    },
  } as unknown as OrgatexPort;
  const batches = {
    async requireWeighable() {
      return {};
    },
    async getRecipe(id: string) {
      return { ...RECIPE, batchId: id };
    },
  } as unknown as BatchService;
  const logs: object[] = [];
  let n = 0;
  const w = createWeighingModule({
    db: opened.db,
    stationId: 'STN-01',
    batches,
    orgatex,
    scales,
    materials: new MaterialService(orgatex, new DrizzleContainerRepository(opened.db)),
    logger: { info: (o) => logs.push(o), warn: (o) => logs.push(o) },
    now: () => NOW,
    newId: () => `ID-${++n}`,
  });
  return { w, scales, orgatexCalls, logs, db: opened.db };
}
export type T = ReturnType<typeof setup>;

export async function started(): Promise<T & { sid: string }> {
  const t = setup();
  t.w.identification.signIn('BDG-0417');
  const { session } = await t.w.starter.startOrResume('B-24187');
  return { ...t, sid: session.sessionId };
}
export const current = (t: T, sid: string) => t.w.ctx.sessions.findById(sid)!;
export const states = (t: T, sid: string) =>
  current(t, sid)
    .snapshot()
    .components.map((c) => c.state);

/** Unlocks the active component by scanning its dyestuff. */
export async function unlock(t: T & { sid: string }, seq: number) {
  await t.w.preparation.verifyIdentity(t.sid, seq, CODES[seq - 1]!);
}
export async function weigh(t: T & { sid: string }, seq: number, net: Quantity, stable = true) {
  t.scales.net = net;
  t.scales.stable = stable;
  return t.w.confirmation.confirm(t.sid, seq);
}
export async function confirmOnTarget(t: T & { sid: string }, seq: number) {
  await unlock(t, seq);
  return weigh(t, seq, TARGETS[seq - 1]!);
}
