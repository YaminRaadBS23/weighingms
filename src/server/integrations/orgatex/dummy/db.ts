import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type OrgatexDb = BetterSQLite3Database<typeof schema>;

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Opens (or creates) the Dummy OrgaTEX database and applies migrations. Use ':memory:' in tests. */
export function openOrgatexDb(filename: string): { db: OrgatexDb; close: () => void } {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { db, close: () => sqlite.close() };
}
