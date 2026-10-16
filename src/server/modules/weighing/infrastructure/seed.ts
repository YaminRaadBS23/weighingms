/**
 * Loads the station's training master data (operators, containers) into weighingms.db (DB-5).
 * Each table is seeded independently and only when empty, so databases created by earlier
 * versions pick up new master data on the next start without losing anything.
 */
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { isUnit, toDecimal, type Quantity } from '../../../../shared/quantity';
import type { WeighingDb } from '../../../db/weighingms/db';
import { containers, operators } from '../../../db/weighingms/schema';
import type { Operator } from '../domain/operator';

export interface ContainerSeed {
  containerId: string;
  type: string;
  tare: Quantity;
  inService: boolean;
  /** Dyestuff this container is proposed for by default (prototype assignment), if any. */
  defaultDyestuffCode: string | null;
}

export interface StationSeed {
  stationId: string;
  operators: Operator[];
  containers: ContainerSeed[];
}

export function readStationSeed(file: string): StationSeed {
  const seed = JSON.parse(readFileSync(file, 'utf8')) as StationSeed;
  for (const o of seed.operators) {
    if (!/^BDG-\d{4}$/.test(o.badgeId)) throw new Error(`Invalid badge ${o.badgeId} in seed`);
    if (o.role === 'SUPERVISOR' && !o.pinHash?.startsWith('scrypt$')) {
      throw new Error(`Supervisor ${o.badgeId} needs a scrypt PIN hash`);
    }
  }
  const defaults = new Set<string>();
  for (const c of seed.containers ?? []) {
    if (!/^[A-Z]-\d{2}$/.test(c.containerId)) {
      throw new Error(`Invalid container ID ${c.containerId} in seed`);
    }
    if (!isUnit(c.tare?.unit)) throw new Error(`Container ${c.containerId} needs a tare unit`);
    toDecimal(c.tare.value);
    if (c.defaultDyestuffCode) {
      if (defaults.has(c.defaultDyestuffCode)) {
        throw new Error(`Two containers default to ${c.defaultDyestuffCode} in seed`);
      }
      defaults.add(c.defaultDyestuffCode);
    }
  }
  return { ...seed, containers: seed.containers ?? [] };
}

const count = (db: WeighingDb, table: typeof operators | typeof containers): number =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .get()?.n ?? 0;

/** Inserts the seed operators only when there are none (keeps state across restarts). */
export function seedOperatorsIfEmpty(db: WeighingDb, seed: StationSeed): boolean {
  if (count(db, operators) > 0) return false;
  db.transaction((tx) => {
    for (const o of seed.operators) tx.insert(operators).values(o).run();
  });
  return true;
}

/** Inserts the seed containers only when there are none. */
export function seedContainersIfEmpty(db: WeighingDb, seed: StationSeed): boolean {
  if (count(db, containers) > 0) return false;
  db.transaction((tx) => {
    for (const c of seed.containers) {
      tx.insert(containers)
        .values({
          containerId: c.containerId,
          type: c.type,
          tareValue: c.tare.value,
          tareUnit: c.tare.unit,
          inService: c.inService,
          defaultDyestuffCode: c.defaultDyestuffCode,
        })
        .run();
    }
  });
  return true;
}
