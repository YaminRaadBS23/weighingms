/** Composition of the completion module: write-back and summary use cases over the weighing data. */
import type { WeighingDb } from '../../db/weighingms/db';
import type { OrgatexPort } from '../../integrations/orgatex/orgatex-port';
import type { WeighingModule } from '../weighing/module';
import { CompletionSummaryService } from './application/completion-summary';
import { ConsumptionWriteBackService } from './application/consumption-write-back';
import { WeighingCompletedBatchReader } from './infrastructure/completed-batches';
import { DrizzleWriteBackRepository } from './infrastructure/drizzle-write-back-repository';

export interface CompletionModuleDeps {
  db: WeighingDb;
  orgatex: OrgatexPort;
  weighing: WeighingModule;
}

export function createCompletionModule(deps: CompletionModuleDeps) {
  const { ctx, identification, auditLog } = deps.weighing;
  const writeBacks = new ConsumptionWriteBackService(
    ctx,
    new WeighingCompletedBatchReader(ctx.sessions, ctx.records),
    new DrizzleWriteBackRepository(deps.db),
    deps.orgatex,
    identification,
    auditLog,
  );
  return { writeBacks, summary: new CompletionSummaryService(ctx, writeBacks) };
}

export type CompletionModule = ReturnType<typeof createCompletionModule>;
