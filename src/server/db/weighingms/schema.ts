/**
 * WeighingMS' own database (weighingms.db) — operators, station state, weighing sessions,
 * component progress and the audit trail. Quantities never appear as REAL; the recipe snapshot
 * is stored as JSON text with decimal strings inside.
 */
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const operators = sqliteTable('operators', {
  operatorId: text('operator_id').primaryKey(),
  badgeId: text('badge_id').notNull().unique(),
  name: text('name').notNull(),
  shift: text('shift').notNull(),
  role: text('role').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  pinHash: text('pin_hash'),
});

export const stationState = sqliteTable('station_state', {
  stationId: text('station_id').primaryKey(),
  currentOperatorId: text('current_operator_id').references(() => operators.operatorId),
  signedInAt: text('signed_in_at'),
});

export const weighingSessions = sqliteTable(
  'weighing_sessions',
  {
    sessionId: text('session_id').primaryKey(),
    batchId: text('batch_id').notNull(),
    stationId: text('station_id').notNull(),
    startedBy: text('started_by')
      .notNull()
      .references(() => operators.operatorId),
    status: text('status').notNull(),
    recipeSnapshot: text('recipe_snapshot').notNull(),
    orgatexStatusSync: text('orgatex_status_sync').notNull(),
    startedAt: text('started_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    completedAt: text('completed_at'),
  },
  (t) => [
    // At most one open (in-progress or suspended) session per batch.
    uniqueIndex('one_open_session_per_batch')
      .on(t.batchId)
      .where(sql`status in ('IN_PROGRESS', 'SUSPENDED')`),
    index('weighing_sessions_station_status').on(t.stationId, t.status),
  ],
);

export const componentWeighings = sqliteTable(
  'component_weighings',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => weighingSessions.sessionId),
    sequence: integer('sequence').notNull(),
    state: text('state').notNull(),
    activatedAt: text('activated_at'),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.sequence] })],
);

/** Append-only (ADR-1): database triggers abort any UPDATE or DELETE on this table. */
export const auditEvents = sqliteTable(
  'audit_events',
  {
    eventId: text('event_id').primaryKey(),
    sessionId: text('session_id').references(() => weighingSessions.sessionId),
    type: text('type').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => operators.operatorId),
    detail: text('detail').notNull(),
    occurredAt: text('occurred_at').notNull(),
  },
  (t) => [index('audit_events_session').on(t.sessionId, t.occurredAt)],
);

/**
 * Container master (WeighingMS-owned, brief §9.3). Tare is a decimal string with a unit.
 * `defaultDyestuffCode` is the prototype's per-component container assignment (TD-8).
 */
export const containers = sqliteTable(
  'containers',
  {
    containerId: text('container_id').primaryKey(),
    type: text('type').notNull(),
    tareValue: text('tare_value').notNull(),
    tareUnit: text('tare_unit').notNull(),
    inService: integer('in_service', { mode: 'boolean' }).notNull(),
    defaultDyestuffCode: text('default_dyestuff_code'),
  },
  (t) => [
    uniqueIndex('containers_default_dyestuff')
      .on(t.defaultDyestuffCode)
      .where(sql`default_dyestuff_code is not null`),
  ],
);
