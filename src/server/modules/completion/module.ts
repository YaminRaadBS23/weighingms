/** Composition of the completion module: write-back, summary and ticket use cases over the weighing data. */
import type { WeighingDb } from '../../db/weighingms/db';
import type { OrgatexPort } from '../../integrations/orgatex/orgatex-port';
import type { PrinterPort } from '../../integrations/printer/printer-port';
import type { WeighingModule } from '../weighing/module';
import { CompletionSummaryService } from './application/completion-summary';
import { ConsumptionWriteBackService } from './application/consumption-write-back';
import { TicketService } from './application/ticket-service';
import { WeighingCompletedBatchReader } from './infrastructure/completed-batches';
import { DrizzleTicketRepository } from './infrastructure/drizzle-ticket-repository';
import { DrizzleWriteBackRepository } from './infrastructure/drizzle-write-back-repository';

export interface CompletionModuleDeps {
  db: WeighingDb;
  orgatex: OrgatexPort;
  printer: PrinterPort;
  weighing: WeighingModule;
}

export function createCompletionModule(deps: CompletionModuleDeps) {
  const { ctx, identification, auditLog } = deps.weighing;
  const reader = new WeighingCompletedBatchReader(ctx.sessions, ctx.records);
  const writeBacks = new ConsumptionWriteBackService(
    ctx,
    reader,
    new DrizzleWriteBackRepository(deps.db),
    deps.orgatex,
    identification,
    auditLog,
  );
  const tickets = new TicketService(
    ctx,
    reader,
    new DrizzleTicketRepository(deps.db),
    deps.printer,
    identification,
    auditLog,
  );
  return { writeBacks, summary: new CompletionSummaryService(ctx, writeBacks), tickets };
}

export type CompletionModule = ReturnType<typeof createCompletionModule>;
