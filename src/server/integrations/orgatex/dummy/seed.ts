import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { isUnit, toDecimal, type Quantity } from '../../../../shared/quantity';
import type { OrgatexDb } from './db';
import { batches, dyestuffs, lots, recipeComponents, recipes } from './schema';

/** Shape of `data/seed/orgatex-seed.json` (Dummy OrgaTEX training scenario). */
export interface OrgatexSeed {
  stationId: string;
  dyestuffs: {
    code: string;
    name: string;
    ticketShortName: string;
    colourHex: string;
    type: string;
  }[];
  lots: { lotId: string; dyestuffCode: string; trainingOnly: boolean }[];
  recipes: {
    recipeId: string;
    shade: string;
    version: string;
    components: {
      sequence: number;
      dyestuffCode: string;
      target: Quantity;
      tolerance: Quantity;
      barMax: Quantity;
      suggestedLot: string | null;
    }[];
  }[];
  batches: {
    batchId: string;
    orderRef: string;
    machineRef: string;
    fabricDesc: string;
    fabricWeight: Quantity;
    shade: string;
    componentCount: number;
    status: string;
    recipeId: string | null;
    releasedAt: string | null;
  }[];
}

const BATCH_STATUSES = new Set(['QUEUED', 'RELEASED', 'WEIGHING', 'WEIGHED']);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid OrgaTEX seed: ${message}`);
}

function assertQuantity(q: unknown, where: string): void {
  const v = q as Quantity | undefined;
  assert(
    v && typeof v.value === 'string' && isUnit(v.unit),
    `${where} must be { value: string, unit: g|kg }`,
  );
  toDecimal(v.value);
}

/** Validates referential integrity and value formats of the seed. Throws on the first problem. */
export function validateSeed(seed: OrgatexSeed): OrgatexSeed {
  const codes = new Set(seed.dyestuffs.map((d) => d.code));
  const lotIds = new Set(seed.lots.map((l) => l.lotId));
  const recipeIds = new Set(seed.recipes.map((r) => r.recipeId));
  assert(seed.stationId, 'stationId is required');
  for (const l of seed.lots)
    assert(codes.has(l.dyestuffCode), `lot ${l.lotId} references unknown dyestuff`);
  for (const r of seed.recipes) {
    r.components.forEach((c, i) => {
      assert(c.sequence === i + 1, `recipe ${r.recipeId} sequences must be 1..n in order`);
      assert(
        codes.has(c.dyestuffCode),
        `recipe ${r.recipeId} component ${c.sequence} unknown dyestuff`,
      );
      assert(!c.suggestedLot || lotIds.has(c.suggestedLot), `recipe ${r.recipeId} unknown lot`);
      assertQuantity(c.target, `${r.recipeId}#${c.sequence}.target`);
      assertQuantity(c.tolerance, `${r.recipeId}#${c.sequence}.tolerance`);
      assertQuantity(c.barMax, `${r.recipeId}#${c.sequence}.barMax`);
    });
  }
  for (const b of seed.batches) {
    assert(BATCH_STATUSES.has(b.status), `batch ${b.batchId} has unknown status ${b.status}`);
    assert(
      !b.recipeId || recipeIds.has(b.recipeId),
      `batch ${b.batchId} references unknown recipe`,
    );
    assertQuantity(b.fabricWeight, `${b.batchId}.fabricWeight`);
  }
  return seed;
}

export function readSeedFile(file: string): OrgatexSeed {
  return validateSeed(JSON.parse(readFileSync(file, 'utf8')) as OrgatexSeed);
}

/** Replaces all Dummy OrgaTEX data with the seed, in one transaction. */
export function loadSeed(db: OrgatexDb, seed: OrgatexSeed): void {
  db.transaction((tx) => {
    tx.delete(batches).run();
    tx.delete(recipeComponents).run();
    tx.delete(recipes).run();
    tx.delete(lots).run();
    tx.delete(dyestuffs).run();
    for (const d of seed.dyestuffs) tx.insert(dyestuffs).values(d).run();
    for (const l of seed.lots) tx.insert(lots).values(l).run();
    for (const r of seed.recipes) {
      tx.insert(recipes).values({ recipeId: r.recipeId, shade: r.shade, version: r.version }).run();
      for (const c of r.components) {
        tx.insert(recipeComponents)
          .values({
            recipeId: r.recipeId,
            sequence: c.sequence,
            dyestuffCode: c.dyestuffCode,
            targetValue: c.target.value,
            targetUnit: c.target.unit,
            toleranceValue: c.tolerance.value,
            toleranceUnit: c.tolerance.unit,
            barMaxValue: c.barMax.value,
            barMaxUnit: c.barMax.unit,
            suggestedLot: c.suggestedLot,
          })
          .run();
      }
    }
    seed.batches.forEach((b, i) =>
      tx
        .insert(batches)
        .values({
          batchId: b.batchId,
          stationId: seed.stationId,
          queuePosition: i + 1,
          orderRef: b.orderRef,
          machineRef: b.machineRef,
          fabricDesc: b.fabricDesc,
          fabricWeightValue: b.fabricWeight.value,
          fabricWeightUnit: b.fabricWeight.unit,
          shade: b.shade,
          componentCount: b.componentCount,
          status: b.status,
          recipeId: b.recipeId,
          releasedAt: b.releasedAt,
        })
        .run(),
    );
  });
}

/** Loads the seed only when the database has no batches yet (keeps state across restarts). */
export function seedIfEmpty(db: OrgatexDb, seed: OrgatexSeed): boolean {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(batches)
    .get();
  if ((row?.n ?? 0) > 0) return false;
  loadSeed(db, seed);
  return true;
}
