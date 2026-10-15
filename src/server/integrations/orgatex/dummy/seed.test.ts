import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { openOrgatexDb, type OrgatexDb } from './db';
import { batches, lots, recipeComponents, recipes } from './schema';
import { loadSeed, readSeedFile, seedIfEmpty, validateSeed, type OrgatexSeed } from './seed';

const SEED_FILE = path.resolve('data/seed/orgatex-seed.json');
let close: (() => void) | undefined;
afterEach(() => close?.());

const count = (db: OrgatexDb, table: SQLiteTable) =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .get()?.n;

describe('Dummy OrgaTEX seed', () => {
  it('the repository seed file is valid', () => {
    expect(() => readSeedFile(SEED_FILE)).not.toThrow();
  });

  it('loads 4 batches, 1 recipe with 5 components and 6 lots', () => {
    const opened = openOrgatexDb(':memory:');
    close = opened.close;
    loadSeed(opened.db, readSeedFile(SEED_FILE));
    expect(count(opened.db, batches)).toBe(4);
    expect(count(opened.db, recipes)).toBe(1);
    expect(count(opened.db, recipeComponents)).toBe(5);
    expect(count(opened.db, lots)).toBe(6);
  });

  it('stores quantities as decimal strings, never numbers', () => {
    const opened = openOrgatexDb(':memory:');
    close = opened.close;
    loadSeed(opened.db, readSeedFile(SEED_FILE));
    for (const c of opened.db.select().from(recipeComponents).all()) {
      expect(typeof c.targetValue).toBe('string');
      expect(typeof c.toleranceValue).toBe('string');
    }
  });

  it('seedIfEmpty keeps existing data', () => {
    const opened = openOrgatexDb(':memory:');
    close = opened.close;
    const seed = readSeedFile(SEED_FILE);
    expect(seedIfEmpty(opened.db, seed)).toBe(true);
    opened.db
      .update(batches)
      .set({ status: 'WEIGHED' })
      .where(sql`batch_id = 'B-24187'`)
      .run();
    expect(seedIfEmpty(opened.db, seed)).toBe(false);
    const row = opened.db
      .select()
      .from(batches)
      .where(sql`batch_id = 'B-24187'`)
      .get();
    expect(row?.status).toBe('WEIGHED');
  });

  it('rejects a seed with a broken reference or a numeric quantity', () => {
    const seed = readSeedFile(SEED_FILE);
    const badRef: OrgatexSeed = structuredClone(seed);
    badRef.lots.push({ lotId: 'X', dyestuffCode: 'NOPE', trainingOnly: true });
    expect(() => validateSeed(badRef)).toThrow(/unknown dyestuff/);

    const badQty = structuredClone(seed) as unknown as {
      recipes: { components: { target: { value: unknown } }[] }[];
    };
    badQty.recipes[0]!.components[0]!.target.value = 1240;
    expect(() => validateSeed(badQty as unknown as OrgatexSeed)).toThrow(/target/);
  });
});
