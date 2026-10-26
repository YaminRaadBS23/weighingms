/**
 * Use case: send the actual consumption of a completed batch to OrgaTEX exactly once (FR-27, FR-28,
 * ADR-10). The write-back row and its idempotency key are committed before OrgaTEX is called; the
 * send happens outside any transaction; an outage is reported as state (PENDING), never an error.
 */
import { ErrorCode } from '../../../../shared/errors';
import type { WriteBackFailureView, WriteBackView } from '../../../../shared/completion';
import { DomainError } from '../../../errors';
import type { OrgatexPort } from '../../../integrations/orgatex/orgatex-port';
import type { AuditLog } from '../../weighing/application/audit-log';
import type { WeighingContext } from '../../weighing/application/context';
import type { OperatorIdentification } from '../../weighing/application/operator-identification';
import { SessionLock } from '../../weighing/application/session-lock';
import {
  InvalidIdempotencyKeyError,
  WriteBackBatchIncompleteError,
  WriteBackKeyMismatchError,
  WriteBackNotFoundError,
} from '../domain/errors';
import { buildPosting } from '../domain/posting-builder';
import type { CompletedBatchReader, WriteBackRepository } from '../domain/repositories';
import { ConsumptionWriteBack } from '../domain/write-back';
import { SessionNotFoundError } from '../../weighing/domain/errors';
import type { WeighingRecord } from '../../weighing/domain/weighing-record';
import type { WeighingSessionProps } from '../../weighing/domain/weighing-session';

/** Port failures that mean "not delivered yet": the write-back stays PENDING. */
const NOT_DELIVERED = new Set<string>([
  ErrorCode.ORGATEX_UNAVAILABLE,
  ErrorCode.ORGATEX_PROTOCOL_ERROR,
  ErrorCode.CONSUMPTION_REJECTED,
  ErrorCode.IDEMPOTENCY_CONFLICT,
  ErrorCode.BATCH_NOT_RELEASED,
  ErrorCode.BATCH_NOT_FOUND,
  ErrorCode.INVALID_STATUS_TRANSITION,
]);

const KEY_PATTERN = /^[\x21-\x7e](?:[\x20-\x7e]{0,126}[\x21-\x7e])?$/;

export interface CompletedBatch {
  session: WeighingSessionProps;
  records: WeighingRecord[];
}

export class ConsumptionWriteBackService {
  private readonly lock = new SessionLock();

  constructor(
    private readonly ctx: WeighingContext,
    private readonly reader: CompletedBatchReader,
    private readonly repo: WriteBackRepository,
    private readonly orgatex: OrgatexPort,
    private readonly identification: OperatorIdentification,
    private readonly auditLog: AuditLog,
  ) {}

  /** The completed batch; NONE → 404, OPEN → the given status. */
  completedBatch(batchId: string, incompleteStatus: 409 | 422): CompletedBatch {
    const found = this.reader.read(batchId);
    if (found.state === 'NONE') throw new SessionNotFoundError(batchId);
    if (found.state === 'OPEN') {
      throw new WriteBackBatchIncompleteError(incompleteStatus, found.done, found.total);
    }
    return { session: found.session, records: found.records };
  }

  /** Requests the write-back of a completed batch and sends it (idempotent). */
  async post(batchId: string, rawKey?: string): Promise<WriteBackView> {
    const key = rawKey === undefined ? undefined : this.checkedKey(rawKey);
    const batch = this.completedBatch(batchId, 422);
    return this.lock.run(batchId, async () => {
      let writeBack = this.repo.findByBatch(batchId);
      if (writeBack) {
        if (key !== undefined && key !== writeBack.idempotencyKey) {
          throw new WriteBackKeyMismatchError(batchId);
        }
        if (writeBack.isConfirmed) return this.view(batch, writeBack);
      } else {
        writeBack = ConsumptionWriteBack.request({
          batchId,
          sessionId: batch.session.sessionId,
          idempotencyKey: key ?? `WB-${batchId}-${batch.session.sessionId}`,
          now: this.ctx.now(),
        });
        this.repo.create(writeBack);
        this.ctx.logger.info(
          { event: 'writeback-requested', batchId, idempotencyKey: writeBack.idempotencyKey },
          'Write-back requested',
        );
      }
      await this.send(batch, writeBack);
      this.repo.save(writeBack);
      return this.view(batch, writeBack);
    });
  }

  /** Sends a PENDING write-back again with the same key; each retry is audited (FR-28). */
  async retry(batchId: string): Promise<WriteBackView> {
    const operator = this.identification.requireCurrent();
    const batch = this.completedBatch(batchId, 422);
    return this.lock.run(batchId, async () => {
      const writeBack = this.repo.findByBatch(batchId);
      if (!writeBack) throw new WriteBackNotFoundError(batchId);
      if (writeBack.isConfirmed) return this.view(batch, writeBack);
      await this.send(batch, writeBack);
      this.ctx.atomically(() => {
        this.repo.save(writeBack);
        this.auditLog.record('WRITEBACK_RETRY', operator.operatorId, batch.session.sessionId, {
          batchId,
          attempt: writeBack.attempts,
          outcome: writeBack.status,
          errorCode: writeBack.snapshot().lastError?.code ?? null,
        });
      });
      this.ctx.logger.info(
        {
          event: 'writeback-retried',
          batchId,
          attempt: writeBack.attempts,
          status: writeBack.status,
        },
        'Write-back retried',
      );
      return this.view(batch, writeBack);
    });
  }

  /** Current state; a completed batch nobody has sent yet is PENDING with `requested: false`. */
  status(batchId: string): WriteBackView {
    const batch = this.completedBatch(batchId, 409);
    return this.view(batch, this.repo.findByBatch(batchId));
  }

  /** Completed batches whose write-back is not CONFIRMED (including those never sent). */
  pendingCount(): number {
    const confirmed = this.repo.confirmedBatchIds();
    return this.reader.completedBatchIds().filter((id) => !confirmed.has(id)).length;
  }

  view(batch: CompletedBatch, writeBack: ConsumptionWriteBack | undefined): WriteBackView {
    const p = writeBack?.snapshot();
    return {
      batchId: batch.session.batchId,
      sessionId: batch.session.sessionId,
      status: p?.status ?? 'PENDING',
      requested: p !== undefined,
      attempts: p?.attempts ?? 0,
      idempotencyKey: p?.idempotencyKey ?? null,
      postingId: p?.postingId ?? null,
      confirmedAt: p?.confirmedAt ?? null,
      lastError: p?.lastError ?? null,
      lines: batch.records.length,
    };
  }

  /** Posting, then WEIGHED; records the outcome on the aggregate (the caller saves it). */
  private async send(batch: CompletedBatch, writeBack: ConsumptionWriteBack): Promise<void> {
    const { session, records } = batch;
    const posting = buildPosting({
      completedAt: session.completedAt ?? this.ctx.now().toISOString(),
      operatorId: session.startedBy,
      records,
    });
    let postingId: string | null = null;
    try {
      const receipt = await this.orgatex.postConsumption(
        session.batchId,
        posting,
        writeBack.idempotencyKey,
      );
      postingId = receipt.postingId;
      await this.orgatex.setBatchStatus(session.batchId, 'WEIGHED');
      writeBack.confirm(receipt, this.ctx.now());
      this.ctx.logger.info(
        { event: 'writeback-confirmed', batchId: session.batchId, postingId },
        'Consumption written to OrgaTEX',
      );
    } catch (err) {
      if (!(err instanceof DomainError) || !NOT_DELIVERED.has(err.code)) throw err;
      const failure: WriteBackFailureView = { code: err.code, message: err.message };
      writeBack.defer(failure, this.ctx.now(), postingId);
      this.ctx.logger.warn(
        { event: 'writeback-deferred', batchId: session.batchId, errorCode: err.code },
        'Consumption not delivered; held as PENDING',
      );
    }
  }

  private checkedKey(raw: string): string {
    const key = raw.trim();
    if (!KEY_PATTERN.test(key)) throw new InvalidIdempotencyKeyError();
    return key;
  }
}
