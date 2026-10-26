import type {
  WeighingRecordRepository,
  WeighingSessionRepository,
} from '../../weighing/domain/repositories';
import type { BatchCompletion, CompletedBatchReader } from '../domain/repositories';

/** Reads the Weighing context's repositories; nothing is ever written through this class. */
export class WeighingCompletedBatchReader implements CompletedBatchReader {
  constructor(
    private readonly sessions: WeighingSessionRepository,
    private readonly records: WeighingRecordRepository,
  ) {}

  read(batchId: string): BatchCompletion {
    const completed = this.sessions.findCompletedByBatch(batchId);
    if (completed) {
      return {
        state: 'COMPLETED',
        session: completed.snapshot(),
        records: this.records.listBySession(completed.sessionId),
      };
    }
    const open = this.sessions.findOpenByBatch(batchId);
    if (open) return { state: 'OPEN', done: open.doneCount, total: open.total };
    return { state: 'NONE' };
  }

  completedBatchIds(): string[] {
    return this.sessions.listCompletedBatchIds();
  }
}
