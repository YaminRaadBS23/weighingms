/** Use case: the numbers on the Confirm & print screen, computed from the records (FR-26). */
import type { CompletionSummaryResponse } from '../../../../shared/completion';
import type { WeighingContext } from '../../weighing/application/context';
import { allWithinTolerance, elapsedSeconds, totalDispensedKg } from '../domain/summary-math';
import type { ConsumptionWriteBackService } from './consumption-write-back';

export class CompletionSummaryService {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly writeBacks: ConsumptionWriteBackService,
  ) {}

  /** Pure read: never calls OrgaTEX and never triggers a send. */
  summary(batchId: string): CompletionSummaryResponse {
    const batch = this.writeBacks.completedBatch(batchId, 409);
    const { session, records } = batch;
    const completedAt = session.completedAt ?? session.updatedAt;
    const starter = this.ctx.operators.findById(session.startedBy);
    return {
      batchId: session.batchId,
      sessionId: session.sessionId,
      componentsWeighed: records.length,
      componentsTotal: session.components.length,
      allWithinTolerance: allWithinTolerance(records.map((r) => r.result)),
      totalDispensed: totalDispensedKg(records.map((r) => r.actual)),
      startedAt: session.startedAt,
      completedAt,
      elapsedSeconds: elapsedSeconds(session.startedAt, completedAt),
      operator: { operatorId: session.startedBy, name: starter?.name ?? session.startedBy },
      writeBack: this.writeBacks.status(batchId),
    };
  }
}
