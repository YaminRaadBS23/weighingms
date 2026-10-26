import { eq } from 'drizzle-orm';
import type { WriteBackStatus } from '../../../../shared/completion';
import type { WeighingDb } from '../../../db/weighingms/db';
import { writeBacks } from '../../../db/weighingms/schema';
import type { WriteBackRepository } from '../domain/repositories';
import { ConsumptionWriteBack } from '../domain/write-back';

type Row = typeof writeBacks.$inferSelect;

const toRow = (wb: ConsumptionWriteBack): Row => {
  const p = wb.snapshot();
  return {
    batchId: p.batchId,
    sessionId: p.sessionId,
    idempotencyKey: p.idempotencyKey,
    status: p.status,
    attempts: p.attempts,
    lastErrorCode: p.lastError?.code ?? null,
    lastErrorMessage: p.lastError?.message ?? null,
    postingId: p.postingId,
    confirmedAt: p.confirmedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

const fromRow = (r: Row): ConsumptionWriteBack =>
  ConsumptionWriteBack.restore({
    batchId: r.batchId,
    sessionId: r.sessionId,
    idempotencyKey: r.idempotencyKey,
    status: r.status as WriteBackStatus,
    attempts: r.attempts,
    lastError:
      r.lastErrorCode !== null
        ? { code: r.lastErrorCode, message: r.lastErrorMessage ?? '' }
        : null,
    postingId: r.postingId,
    confirmedAt: r.confirmedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });

export class DrizzleWriteBackRepository implements WriteBackRepository {
  constructor(private readonly db: WeighingDb) {}

  create(writeBack: ConsumptionWriteBack): void {
    this.db.insert(writeBacks).values(toRow(writeBack)).run();
  }

  /** Stores the outcome of an attempt; identity columns are never written. */
  save(writeBack: ConsumptionWriteBack): void {
    const row = toRow(writeBack);
    const outcome = {
      status: row.status,
      attempts: row.attempts,
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      postingId: row.postingId,
      confirmedAt: row.confirmedAt,
      updatedAt: row.updatedAt,
    };
    this.db.update(writeBacks).set(outcome).where(eq(writeBacks.batchId, row.batchId)).run();
  }

  findByBatch(batchId: string): ConsumptionWriteBack | undefined {
    const row = this.db.select().from(writeBacks).where(eq(writeBacks.batchId, batchId)).get();
    return row ? fromRow(row) : undefined;
  }

  confirmedBatchIds(): Set<string> {
    return new Set(
      this.db
        .select({ batchId: writeBacks.batchId })
        .from(writeBacks)
        .where(eq(writeBacks.status, 'CONFIRMED'))
        .all()
        .map((r) => r.batchId),
    );
  }
}
