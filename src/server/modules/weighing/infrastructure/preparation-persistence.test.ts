import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openWeighingDb } from '../../../db/weighingms/db';
import { componentWeighings } from '../../../db/weighingms/schema';
import { WeighingSession, type RecipeSnapshot } from '../domain/weighing-session';
import { DrizzleWeighingSessionRepository } from './drizzle-repositories';
import { hashPin, scryptPinVerifier } from './pin-hash';
import { readStationSeed, seedOperatorsIfEmpty } from './seed';

const T0 = new Date('2026-10-24T07:00:00Z');
const recipe: RecipeSnapshot = {
  recipeId: 'RCP',
  version: '1',
  shade: 'Teal 4C',
  takenAt: T0.toISOString(),
  components: [1, 2].map((sequence) => ({
    sequence,
    dyestuff: {
      code: `DYE-000${sequence}`,
      name: 'n',
      shortName: 'n',
      colourHex: '#000',
      type: 'DYE',
    },
    target: { value: '94.0', unit: 'g' as const },
    tolerance: { value: '0.5', unit: 'g' as const },
    barMax: { value: '125', unit: 'g' as const },
    suggestedLotId: null,
  })),
};

let close: (() => void) | undefined;
afterEach(() => close?.());

function setup() {
  const opened = openWeighingDb(':memory:');
  close = opened.close;
  seedOperatorsIfEmpty(opened.db, readStationSeed(path.resolve('data/seed/station-seed.json')));
  return { db: opened.db, repo: new DrizzleWeighingSessionRepository(opened.db) };
}

const newSession = () =>
  WeighingSession.start({
    sessionId: 'S-1',
    batchId: 'B-24187',
    stationId: 'STN-01',
    startedBy: 'OP-0417',
    recipe,
    now: T0,
  });

function unlock(s: WeighingSession) {
  s.assignScale(
    1,
    {
      scaleId: 'scale-3kg',
      mode: 'AUTO',
      reason: null,
      requirement: { value: '308.5', unit: 'g' },
    },
    T0,
  );
  s.verifyIdentity(1, 'DYE-0001', T0);
  s.setLot(1, { lotId: '2026-0387', source: 'DEFAULT' }, T0);
  s.setContainer(
    1,
    { containerId: 'C-12', tare: { value: '214.0', unit: 'g' }, source: 'SCANNED' },
    T0,
  );
  s.applyTare(1, { value: '214.0', unit: 'g' }, T0);
}

describe('component preparation persistence (migration 0003)', () => {
  it('round-trips scale, identity, lot, container and tare as decimal text', () => {
    const { repo, db } = setup();
    const s = newSession();
    unlock(s);
    repo.save(s);
    const loaded = repo.findById('S-1')!;
    expect(loaded.snapshot().components[0]).toEqual(s.snapshot().components[0]);
    expect(loaded.preparationState(1)).toBe('UNLOCKED');
    const row = db
      .select()
      .from(componentWeighings)
      .where(eq(componentWeighings.sequence, 1))
      .get()!;
    expect(row).toMatchObject({
      scaleId: 'scale-3kg',
      scaleMode: 'AUTO',
      requirementValue: '308.5',
      lotId: '2026-0387',
      lotSource: 'DEFAULT',
      containerId: 'C-12',
      containerSource: 'SCANNED',
      containerTareValue: '214.0',
      containerTareUnit: 'g',
      tareValue: '214.0',
      tareUnit: 'g',
    });
  });

  it('activating another component clears every preparation column of the previous one', () => {
    const { repo, db } = setup();
    const s = newSession();
    unlock(s);
    repo.save(s);
    s.activate(2, T0);
    repo.save(s);
    const rows = db.select().from(componentWeighings).all();
    const first = rows.find((r) => r.sequence === 1)!;
    expect(first).toMatchObject({
      state: 'PENDING',
      scaleId: null,
      identityVerifiedAt: null,
      lotId: null,
      containerId: null,
      tareValue: null,
      unlockedAt: null,
    });
    expect(repo.findById('S-1')!.preparationState(2)).toBe('AWAITING_IDENTITY');
  });

  it('an active component saved before bolt 009 (no preparation columns) loads as "no scale, nothing verified"', () => {
    const { repo, db } = setup();
    repo.save(newSession());
    db.update(componentWeighings)
      .set({
        scaleId: null,
        scaleMode: null,
        scaleReason: null,
        requirementValue: null,
        requirementUnit: null,
        identityVerifiedAt: null,
      })
      .where(eq(componentWeighings.sequence, 1))
      .run();
    const loaded = repo.findById('S-1')!;
    expect(loaded.snapshot().components[0]!.scale).toEqual({
      scaleId: null,
      mode: 'AUTO',
      reason: 'NO_SUITABLE_SCALE',
      requirement: null,
    });
    expect(loaded.preparationState(1)).toBe('AWAITING_IDENTITY');
    expect(loaded.snapshot().components[1]).toMatchObject({ scale: null, preparation: null });
  });

  it('a manual assignment keeps its mode and the pending state needs no stored state column', () => {
    const { repo } = setup();
    const s = newSession();
    unlock(s);
    s.assignScale(
      1,
      {
        scaleId: 'scale-32kg',
        mode: 'MANUAL',
        reason: null,
        requirement: { value: '308.5', unit: 'g' },
      },
      T0,
    );
    repo.save(s);
    const loaded = repo.findById('S-1')!;
    expect(loaded.snapshot().components[0]!.scale).toMatchObject({
      scaleId: 'scale-32kg',
      mode: 'MANUAL',
    });
    expect(loaded.preparationState(1)).toBe('AWAITING_TARE'); // tare discarded by the new scale
  });
});

describe('scryptPinVerifier', () => {
  const hash = hashPin('2580');
  it('accepts the right PIN and refuses a wrong one', () => {
    expect(scryptPinVerifier.verify('2580', hash)).toBe(true);
    expect(scryptPinVerifier.verify('0000', hash)).toBe(false);
  });
  it('refuses when no hash is on record, or the hash is malformed — after doing the same work', () => {
    expect(scryptPinVerifier.verify('2580', null)).toBe(false);
    expect(scryptPinVerifier.verify('2580', 'not-a-hash')).toBe(false);
  });
});
