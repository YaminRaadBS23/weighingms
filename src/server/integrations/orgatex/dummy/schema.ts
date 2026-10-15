/**
 * Dummy OrgaTEX database schema (orgatex.db).
 * TRAINING CONTRACT ONLY — this models a stand-in for OrgaTEX, not the real OrgaTEX data model.
 * Quantities are stored as decimal TEXT plus a unit column, never REAL.
 */
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const dyestuffs = sqliteTable('dyestuffs', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  ticketShortName: text('ticket_short_name').notNull(),
  colourHex: text('colour_hex').notNull(),
  type: text('type').notNull(),
});

export const lots = sqliteTable('lots', {
  lotId: text('lot_id').primaryKey(),
  dyestuffCode: text('dyestuff_code')
    .notNull()
    .references(() => dyestuffs.code),
  trainingOnly: integer('training_only', { mode: 'boolean' }).notNull().default(false),
});

export const recipes = sqliteTable('recipes', {
  recipeId: text('recipe_id').primaryKey(),
  shade: text('shade').notNull(),
  version: text('version').notNull(),
});

export const recipeComponents = sqliteTable(
  'recipe_components',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.recipeId),
    sequence: integer('sequence').notNull(),
    dyestuffCode: text('dyestuff_code')
      .notNull()
      .references(() => dyestuffs.code),
    targetValue: text('target_value').notNull(),
    targetUnit: text('target_unit').notNull(),
    toleranceValue: text('tolerance_value').notNull(),
    toleranceUnit: text('tolerance_unit').notNull(),
    barMaxValue: text('bar_max_value').notNull(),
    barMaxUnit: text('bar_max_unit').notNull(),
    suggestedLot: text('suggested_lot').references(() => lots.lotId),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.sequence] })],
);

export const batches = sqliteTable('batches', {
  batchId: text('batch_id').primaryKey(),
  stationId: text('station_id').notNull(),
  queuePosition: integer('queue_position').notNull(),
  orderRef: text('order_ref').notNull(),
  machineRef: text('machine_ref').notNull(),
  fabricDesc: text('fabric_desc').notNull(),
  fabricWeightValue: text('fabric_weight_value').notNull(),
  fabricWeightUnit: text('fabric_weight_unit').notNull(),
  shade: text('shade').notNull(),
  componentCount: integer('component_count').notNull(),
  status: text('status').notNull(),
  recipeId: text('recipe_id').references(() => recipes.recipeId),
  releasedAt: text('released_at'),
});

/** Consumption postings received from WeighingMS (one per idempotency key). */
export const consumptionPostings = sqliteTable(
  'consumption_postings',
  {
    postingId: text('posting_id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    batchId: text('batch_id')
      .notNull()
      .references(() => batches.batchId),
    operatorId: text('operator_id'),
    completedAt: text('completed_at').notNull(),
    receivedAt: text('received_at').notNull(),
  },
  (t) => [uniqueIndex('consumption_postings_idempotency_key').on(t.idempotencyKey)],
);

export const consumptionLines = sqliteTable(
  'consumption_lines',
  {
    postingId: text('posting_id')
      .notNull()
      .references(() => consumptionPostings.postingId),
    sequence: integer('sequence').notNull(),
    dyestuffCode: text('dyestuff_code')
      .notNull()
      .references(() => dyestuffs.code),
    lotId: text('lot_id').references(() => lots.lotId),
    actualValue: text('actual_value').notNull(),
    actualUnit: text('actual_unit').notNull(),
    targetValue: text('target_value').notNull(),
    targetUnit: text('target_unit').notNull(),
    result: text('result').notNull(),
  },
  (t) => [primaryKey({ columns: [t.postingId, t.sequence] })],
);
