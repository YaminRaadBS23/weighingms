/** Loads the station's training master data (operators) into weighingms.db when empty (DB-5). */
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { WeighingDb } from '../../../db/weighingms/db';
import { operators } from '../../../db/weighingms/schema';
import type { Operator } from '../domain/operator';

export interface StationSeed {
  stationId: string;
  operators: Operator[];
}

export function readStationSeed(file: string): StationSeed {
  const seed = JSON.parse(readFileSync(file, 'utf8')) as StationSeed;
  for (const o of seed.operators) {
    if (!/^BDG-\d{4}$/.test(o.badgeId)) throw new Error(`Invalid badge ${o.badgeId} in seed`);
    if (o.role === 'SUPERVISOR' && !o.pinHash?.startsWith('scrypt$')) {
      throw new Error(`Supervisor ${o.badgeId} needs a scrypt PIN hash`);
    }
  }
  return seed;
}

/** Inserts the seed operators only when there are none (keeps state across restarts). */
export function seedOperatorsIfEmpty(db: WeighingDb, seed: StationSeed): boolean {
  const n =
    db
      .select({ n: sql<number>`count(*)` })
      .from(operators)
      .get()?.n ?? 0;
  if (n > 0) return false;
  db.transaction((tx) => {
    for (const o of seed.operators) tx.insert(operators).values(o).run();
  });
  return true;
}
