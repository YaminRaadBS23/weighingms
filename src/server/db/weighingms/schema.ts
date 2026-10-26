/**
 * WeighingMS' own database (weighingms.db) — operators, station state, weighing sessions,
 * component progress and the audit trail. Quantities never appear as REAL; the recipe snapshot
 * is stored as JSON text with decimal strings inside.
 */
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
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
    // Preparation of the active component (bolt 009); all null while not ACTIVE. Quantities are
    // decimal text with a unit; the preparation state is derived on load, never stored.
    scaleId: text('scale_id'),
    scaleMode: text('scale_mode'),
    scaleReason: text('scale_reason'),
    requirementValue: text('requirement_value'),
    requirementUnit: text('requirement_unit'),
    identityVerifiedAt: text('identity_verified_at'),
    lotId: text('lot_id'),
    lotSource: text('lot_source'),
    containerId: text('container_id'),
    containerSource: text('container_source'),
    containerTareValue: text('container_tare_value'),
    containerTareUnit: text('container_tare_unit'),
    tareValue: text('tare_value'),
    tareUnit: text('tare_unit'),
    unlockedAt: text('unlocked_at'),
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

/**
 * Confirmed weighings (FR-19). Append-only: triggers abort any UPDATE or DELETE (ADR-1 technique,
 * NFR-8) and (session_id, sequence) is unique. Quantities are decimal text with a unit.
 */
export const weighingRecords = sqliteTable(
  'weighing_records',
  {
    recordId: text('record_id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => weighingSessions.sessionId),
    batchId: text('batch_id').notNull(),
    sequence: integer('sequence').notNull(),
    dyestuffCode: text('dyestuff_code').notNull(),
    dyestuffName: text('dyestuff_name').notNull(),
    actualValue: text('actual_value').notNull(),
    actualUnit: text('actual_unit').notNull(),
    targetValue: text('target_value').notNull(),
    targetUnit: text('target_unit').notNull(),
    tolLowerValue: text('tol_lower_value').notNull(),
    tolLowerUnit: text('tol_lower_unit').notNull(),
    tolUpperValue: text('tol_upper_value').notNull(),
    tolUpperUnit: text('tol_upper_unit').notNull(),
    lotId: text('lot_id').notNull(),
    containerId: text('container_id').notNull(),
    tareValue: text('tare_value').notNull(),
    tareUnit: text('tare_unit').notNull(),
    scaleId: text('scale_id').notNull(),
    operatorId: text('operator_id')
      .notNull()
      .references(() => operators.operatorId),
    confirmedAt: text('confirmed_at').notNull(),
    result: text('result').notNull(),
    surplusValue: text('surplus_value'),
    surplusUnit: text('surplus_unit'),
    surplusPercent: text('surplus_percent'),
    // Supervisor override (ADR-9): set exactly when result = 'OVERRIDDEN' (insert trigger, 0007).
    overrideSupervisorId: text('override_supervisor_id').references(() => operators.operatorId),
    overrideReason: text('override_reason'),
    overrideZone: text('override_zone'),
    overrideAt: text('override_at'),
  },
  (t) => [uniqueIndex('one_record_per_component').on(t.sessionId, t.sequence)],
);

/**
 * Consumption write-back of a completed batch (ADR-10): one row per batch, its idempotency key
 * committed before OrgaTEX is called. Rows are never deleted, a CONFIRMED row never changes
 * (triggers, migration 0009).
 */
export const writeBacks = sqliteTable('write_backs', {
  batchId: text('batch_id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => weighingSessions.sessionId),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  postingId: text('posting_id'),
  confirmedAt: text('confirmed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Weighing tickets and their reprints (ADR-11). Content and identity are never updated. */
export const tickets = sqliteTable(
  'tickets',
  {
    ticketId: text('ticket_id').primaryKey(),
    batchId: text('batch_id').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => weighingSessions.sessionId),
    isReprint: integer('is_reprint', { mode: 'boolean' }).notNull(),
    reprintOf: text('reprint_of').references((): AnySQLiteColumn => tickets.ticketId),
    content: text('content').notNull(),
    barcodeValue: text('barcode_value').notNull(),
    printStatus: text('print_status').notNull(),
    printAttempts: integer('print_attempts').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorState: text('last_error_state'),
    lastErrorMessage: text('last_error_message'),
    jobId: text('job_id'),
    printedAt: text('printed_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => operators.operatorId),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    // At most one original ticket per batch; reprints are separate rows.
    uniqueIndex('one_original_per_batch')
      .on(t.batchId)
      .where(sql`is_reprint = 0`),
    index('tickets_batch_created').on(t.batchId, t.createdAt),
  ],
);
