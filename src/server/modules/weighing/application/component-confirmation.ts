/**
 * Use cases: confirm a weighing and complete the batch (ddd-01 invariants 16–19, ADR-7, ADR-8).
 *
 * The server measures: the weight judged and recorded is one fresh reading taken here; the command
 * carries no weight. The record, the component becoming DONE, the next component becoming ACTIVE and
 * (for the last component) the session becoming COMPLETED are committed as one transaction.
 */
import { evaluateZone, isConfirmable, toleranceBand } from '../../../../shared/domain/tolerance';
import { DomainError } from '../../../errors';
import {
  ReadingUnstableError,
  SessionNotFoundError,
  ToleranceViolationError,
} from '../domain/errors';
import { buildRecord, type WeighingRecord } from '../domain/weighing-record';
import type { WeighingSession } from '../domain/weighing-session';
import type { ComponentMeasurement } from './component-measurement';
import type { ComponentPreparation } from './component-preparation';
import type { WeighingContext } from './context';
import type { OperatorIdentification } from './operator-identification';

export interface ConfirmationResult {
  record: WeighingRecord;
  session: WeighingSession;
}

export class ComponentConfirmation {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly measurement: ComponentMeasurement,
    private readonly preparation: ComponentPreparation,
    private readonly identification: OperatorIdentification,
  ) {}

  confirm(sessionId: string, sequence: number): Promise<ConfirmationResult> {
    return this.preparation.lock.run(sessionId, async () => {
      try {
        return await this.confirmLocked(sessionId, sequence);
      } catch (err) {
        if (err instanceof DomainError) {
          this.ctx.logger.warn(
            { event: 'confirmation-refused', sessionId, sequence, reason: err.code },
            'Confirmation refused',
          );
        }
        throw err;
      }
    });
  }

  /** Completes the batch if every component is done (idempotent once completed). */
  complete(sessionId: string): Promise<WeighingSession> {
    return this.preparation.lock.run(sessionId, async () => {
      const session = this.load(sessionId);
      const wasCompleted = session.status === 'COMPLETED';
      session.complete(this.ctx.now());
      if (!wasCompleted) {
        this.ctx.sessions.save(session);
        this.ctx.logger.info(
          { event: 'batch-completed', sessionId, batchId: session.batchId },
          'Batch completed',
        );
      }
      return session;
    });
  }

  private async confirmLocked(sessionId: string, sequence: number): Promise<ConfirmationResult> {
    const operator = this.identification.requireCurrent();
    const session = this.load(sessionId);
    const now = this.ctx.now();

    // The assigned scale must be usable now (BR-24); then ONE fresh reading decides everything.
    const { scaleId, spec, reading } = await this.measurement.measure(session, sequence);
    if (!reading.stable) throw new ReadingUnstableError(scaleId);

    const zone = evaluateZone(reading.net, spec);
    if (!isConfirmable(zone)) {
      const band = toleranceBand(spec);
      throw new ToleranceViolationError({
        zone,
        weight: reading.net,
        lower: band.lower,
        upper: band.upper,
      });
    }

    const prep = session.activeSnapshot(sequence).preparation!;
    const record = buildRecord({
      recordId: this.ctx.newId(),
      sessionId,
      batchId: session.batchId,
      spec,
      actual: reading.net,
      lotId: prep.lot!.lotId,
      containerId: prep.container!.containerId,
      tare: prep.tareApplied!,
      scaleId,
      operatorId: operator.operatorId,
      confirmedAt: now,
    });

    const next = session.confirm(sequence, now);
    if (next !== null) await this.preparation.assignScale(session, next);

    // One transaction: the record and the new state are both stored, or neither (NFR-5).
    this.ctx.atomically(() => {
      this.ctx.records.append(record);
      this.ctx.sessions.save(session);
    });

    this.ctx.logger.info(
      {
        event: 'component-confirmed',
        sessionId,
        sequence,
        recordId: record.recordId,
        actual: record.actual,
      },
      'Component confirmed',
    );
    if (next === null) {
      this.ctx.logger.info(
        { event: 'batch-completed', sessionId, batchId: session.batchId },
        'Batch completed',
      );
    }
    return { record, session };
  }

  private load(sessionId: string): WeighingSession {
    const session = this.ctx.sessions.findById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }
}
