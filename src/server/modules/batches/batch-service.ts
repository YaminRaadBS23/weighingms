/**
 * WeighingMS' view of OrgaTEX work: queue, batch, recipe, and the release check used when a
 * weighing session starts. No storage — OrgaTEX stays the master of batches and recipes (C-01).
 */
import type { BatchDetailResponse, BatchSummary, RecipeResponse } from '../../../shared/batches';
import { batchSelectability } from '../../../shared/domain/batch-selection';
import { normaliseCode } from '../../../shared/scan-codes';
import { BatchNotReleasedError } from '../../errors';
import type { OrgatexBatch, OrgatexPort } from '../../integrations/orgatex/orgatex-port';

function summary(b: OrgatexBatch): BatchSummary {
  return {
    batchId: b.batchId,
    orderRef: b.orderRef,
    machineRef: b.machineRef,
    fabric: { description: b.fabricDesc, weight: b.fabricWeight },
    shade: b.shade,
    componentCount: b.componentCount,
    status: b.status,
    ...batchSelectability(b.status, b.hasRecipe),
  };
}

export class BatchService {
  constructor(
    private readonly orgatex: OrgatexPort,
    private readonly stationId: string,
  ) {}

  async getQueue(): Promise<{ items: BatchSummary[]; receivedAt: string }> {
    const queue = await this.orgatex.listBatches(this.stationId);
    return { items: queue.batches.map(summary), receivedAt: queue.receivedAt };
  }

  /** Accepts a scanned or typed ID (trimmed, upper-cased). */
  async getBatch(rawBatchId: string): Promise<BatchDetailResponse> {
    const batch = await this.orgatex.getBatch(normaliseCode(rawBatchId));
    return { ...summary(batch), releasedAt: batch.releasedAt };
  }

  async getRecipe(rawBatchId: string): Promise<RecipeResponse> {
    const recipe = await this.orgatex.getRecipe(normaliseCode(rawBatchId));
    return {
      batchId: recipe.batchId,
      recipeId: recipe.recipeId,
      shade: recipe.shade,
      version: recipe.version,
      components: recipe.components.map((c) => ({
        sequence: c.sequence,
        dyestuff: {
          code: c.dyestuff.code,
          name: c.dyestuff.name,
          shortName: c.dyestuff.ticketShortName,
          colourHex: c.dyestuff.colourHex,
          type: c.dyestuff.type,
        },
        target: c.target,
        tolerance: c.tolerance,
        barMax: c.barMax,
        suggestedLotId: c.suggestedLotId,
      })),
    };
  }

  /**
   * The batch may be weighed (started or resumed); otherwise 409 BATCH_NOT_RELEASED with the reason.
   * Used when a weighing session is started (bolt 006).
   */
  async requireWeighable(rawBatchId: string): Promise<BatchDetailResponse> {
    const batch = await this.getBatch(rawBatchId);
    if (!batch.selectable) {
      throw new BatchNotReleasedError(batch.batchId, batch.reason ?? 'Not selectable');
    }
    return batch;
  }
}
