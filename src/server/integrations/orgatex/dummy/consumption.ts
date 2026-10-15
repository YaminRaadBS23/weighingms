/**
 * Dummy OrgaTEX consumption postings and batch status transitions (training contract).
 * Postings are idempotent per key: a repeat with the same body returns the original receipt,
 * a repeat with a different body is a conflict.
 */
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { isUnit, toDecimal, type Unit } from '../../../../shared/quantity';
import type {
  DummyBatchStatus,
  DummyConsumptionLine,
  DummyConsumptionReceipt,
  DummyConsumptionRequest,
} from './contract';
import type { OrgatexDb } from './db';
import { batches, consumptionLines, consumptionPostings, lots, recipeComponents } from './schema';

/** An answer the dummy routes turn into an HTTP error response. */
export class DummyRejection extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const RELEASED_STATES = new Set<DummyBatchStatus>(['RELEASED', 'WEIGHING', 'WEIGHED']);

/** Forward-only transitions; repeating the current status is allowed (idempotent). */
const ALLOWED: Record<DummyBatchStatus, DummyBatchStatus[]> = {
  QUEUED: [],
  RELEASED: ['WEIGHING', 'WEIGHED'],
  WEIGHING: ['WEIGHED'],
  WEIGHED: [],
};

function canonicalHash(body: DummyConsumptionRequest): string {
  const canonical = {
    completedAt: body.completedAt,
    operatorId: body.operatorId ?? null,
    lines: [...body.lines]
      .sort((a, b) => a.sequence - b.sequence)
      .map((l) => ({
        sequence: l.sequence,
        dyestuffCode: l.dyestuffCode,
        lotId: l.lotId ?? null,
        actual: { value: l.actual.value, unit: l.actual.unit },
        target: { value: l.target.value, unit: l.target.unit },
        result: l.result,
      })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function isQuantity(q: unknown): q is { value: string; unit: Unit } {
  const v = q as { value?: unknown; unit?: unknown } | null;
  if (!v || typeof v.value !== 'string' || !isUnit(v.unit)) return false;
  try {
    toDecimal(v.value);
    return true;
  } catch {
    return false;
  }
}

function reject(message: string): never {
  throw new DummyRejection(422, 'CONSUMPTION_REJECTED', message);
}

function loadReceipt(db: Pick<OrgatexDb, 'select'>, postingId: string): DummyConsumptionReceipt {
  const p = db
    .select()
    .from(consumptionPostings)
    .where(eq(consumptionPostings.postingId, postingId))
    .get();
  if (!p) throw new Error(`posting ${postingId} vanished`);
  const lines = db
    .select()
    .from(consumptionLines)
    .where(eq(consumptionLines.postingId, postingId))
    .orderBy(asc(consumptionLines.sequence))
    .all();
  return {
    postingId: p.postingId,
    batchId: p.batchId,
    idempotencyKey: p.idempotencyKey,
    operatorId: p.operatorId,
    completedAt: p.completedAt,
    receivedAt: p.receivedAt,
    lines: lines.map((l): DummyConsumptionLine => ({
      sequence: l.sequence,
      dyestuffCode: l.dyestuffCode,
      lotId: l.lotId,
      actual: { value: l.actualValue, unit: l.actualUnit as Unit },
      target: { value: l.targetValue, unit: l.targetUnit as Unit },
      result: l.result,
    })),
  };
}

/** Stores a posting once per idempotency key. Throws DummyRejection for 4xx answers. */
export function recordConsumption(
  db: OrgatexDb,
  batchId: string,
  idempotencyKey: string,
  body: DummyConsumptionRequest,
  now: Date,
): DummyConsumptionReceipt {
  return db.transaction((tx) => {
    const hash = canonicalHash(body);
    const existing = tx
      .select()
      .from(consumptionPostings)
      .where(eq(consumptionPostings.idempotencyKey, idempotencyKey))
      .get();
    if (existing) {
      if (existing.requestHash !== hash || existing.batchId !== batchId) {
        throw new DummyRejection(
          409,
          'IDEMPOTENCY_CONFLICT',
          `Idempotency key ${idempotencyKey} was already used with a different request`,
        );
      }
      return loadReceipt(tx, existing.postingId);
    }

    const batch = tx.select().from(batches).where(eq(batches.batchId, batchId)).get();
    if (!batch) throw new DummyRejection(404, 'BATCH_NOT_FOUND', `Batch ${batchId} not found`);
    if (!RELEASED_STATES.has(batch.status as DummyBatchStatus)) {
      throw new DummyRejection(409, 'BATCH_NOT_RELEASED', `Batch ${batchId} is not released`);
    }

    if (!Array.isArray(body.lines) || body.lines.length === 0) reject('lines must not be empty');
    const recipeCodes = new Set(
      tx
        .select({ code: recipeComponents.dyestuffCode })
        .from(recipeComponents)
        .where(eq(recipeComponents.recipeId, batch.recipeId ?? ''))
        .all()
        .map((r) => r.code),
    );
    const seen = new Set<number>();
    for (const line of body.lines) {
      if (!Number.isInteger(line.sequence) || seen.has(line.sequence)) {
        reject(`invalid or duplicate sequence ${String(line.sequence)}`);
      }
      seen.add(line.sequence);
      if (!recipeCodes.has(line.dyestuffCode)) {
        reject(`dyestuff ${line.dyestuffCode} is not part of the recipe of ${batchId}`);
      }
      if (line.lotId) {
        const lot = tx
          .select()
          .from(lots)
          .where(and(eq(lots.lotId, line.lotId), eq(lots.dyestuffCode, line.dyestuffCode)))
          .get();
        if (!lot) reject(`lot ${line.lotId} does not belong to dyestuff ${line.dyestuffCode}`);
      }
      if (!isQuantity(line.actual) || !isQuantity(line.target)) {
        reject(`line ${line.sequence}: quantities must be { value: decimal string, unit: g|kg }`);
      }
      if (typeof line.result !== 'string' || !line.result)
        reject(`line ${line.sequence}: result required`);
    }
    if (typeof body.completedAt !== 'string' || !body.completedAt) reject('completedAt required');

    const postingId = randomUUID();
    tx.insert(consumptionPostings)
      .values({
        postingId,
        idempotencyKey,
        requestHash: hash,
        batchId,
        operatorId: body.operatorId ?? null,
        completedAt: body.completedAt,
        receivedAt: now.toISOString(),
      })
      .run();
    for (const l of body.lines) {
      tx.insert(consumptionLines)
        .values({
          postingId,
          sequence: l.sequence,
          dyestuffCode: l.dyestuffCode,
          lotId: l.lotId ?? null,
          actualValue: l.actual.value,
          actualUnit: l.actual.unit,
          targetValue: l.target.value,
          targetUnit: l.target.unit,
          result: l.result,
        })
        .run();
    }
    return loadReceipt(tx, postingId);
  });
}

export function listConsumption(db: OrgatexDb, batchId: string): DummyConsumptionReceipt[] {
  return db
    .select({ postingId: consumptionPostings.postingId })
    .from(consumptionPostings)
    .where(eq(consumptionPostings.batchId, batchId))
    .orderBy(asc(consumptionPostings.receivedAt))
    .all()
    .map((p) => loadReceipt(db, p.postingId));
}

/** Applies a forward-only status transition. Throws DummyRejection for 4xx answers. */
export function updateBatchStatus(db: OrgatexDb, batchId: string, next: unknown): void {
  if (next !== 'WEIGHING' && next !== 'WEIGHED') {
    throw new DummyRejection(400, 'VALIDATION_ERROR', 'status must be WEIGHING or WEIGHED');
  }
  const batch = db.select().from(batches).where(eq(batches.batchId, batchId)).get();
  if (!batch) throw new DummyRejection(404, 'BATCH_NOT_FOUND', `Batch ${batchId} not found`);
  const current = batch.status as DummyBatchStatus;
  if (current === next) return;
  if (current === 'QUEUED') {
    throw new DummyRejection(409, 'BATCH_NOT_RELEASED', `Batch ${batchId} is not released`);
  }
  if (!ALLOWED[current].includes(next)) {
    throw new DummyRejection(
      409,
      'INVALID_STATUS_TRANSITION',
      `Batch ${batchId} cannot go from ${current} to ${next}`,
    );
  }
  db.update(batches).set({ status: next }).where(eq(batches.batchId, batchId)).run();
}
