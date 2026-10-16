/**
 * OrgatexPort — WeighingMS' only way to talk to OrgaTEX (brief IR-07).
 * Types here are WeighingMS' view of OrgaTEX data, independent of any OrgaTEX wire format.
 * Errors: BatchNotFoundError, RecipeNotFoundError, DyestuffNotFoundError (404),
 * BatchNotReleasedError, IdempotencyConflictError, InvalidStatusTransitionError (409),
 * ConsumptionRejectedError (422), OrgatexUnavailableError (503), OrgatexProtocolError (502).
 */
import type { Quantity } from '../../../shared/quantity';

export type OrgatexBatchStatus = 'QUEUED' | 'RELEASED' | 'WEIGHING' | 'WEIGHED';

export interface OrgatexBatch {
  batchId: string;
  orderRef: string;
  machineRef: string;
  fabricDesc: string;
  fabricWeight: Quantity;
  shade: string;
  componentCount: number;
  status: OrgatexBatchStatus;
  hasRecipe: boolean;
  releasedAt: string | null;
}

export interface OrgatexBatchQueue {
  batches: OrgatexBatch[];
  /** When WeighingMS received the queue (shown as "Queue received from OrgaTEX at hh:mm"). */
  receivedAt: string;
}

export interface OrgatexDyestuff {
  code: string;
  name: string;
  ticketShortName: string;
  colourHex: string;
  type: string;
}

export interface OrgatexRecipeComponent {
  sequence: number;
  dyestuff: OrgatexDyestuff;
  target: Quantity;
  tolerance: Quantity;
  barMax: Quantity;
  suggestedLotId: string | null;
}

export interface OrgatexRecipe {
  recipeId: string;
  batchId: string;
  shade: string;
  version: string;
  components: OrgatexRecipeComponent[];
}

export interface OrgatexLot {
  lotId: string;
  dyestuffCode: string;
}

/** Actual consumption of one recipe component, as reported to OrgaTEX (brief IR-05). */
export interface OrgatexConsumptionLine {
  sequence: number;
  dyestuffCode: string;
  lotId: string | null;
  actual: Quantity;
  target: Quantity;
  /** WeighingMS weighing result, e.g. IN_TOLERANCE or OVERRIDDEN. */
  result: string;
}

export interface OrgatexConsumptionPosting {
  completedAt: string;
  operatorId: string | null;
  lines: OrgatexConsumptionLine[];
}

/** OrgaTEX' acknowledgement of a posting; identical for a retried posting with the same key. */
export interface OrgatexConsumptionReceipt {
  postingId: string;
  batchId: string;
  idempotencyKey: string;
  receivedAt: string;
  lines: OrgatexConsumptionLine[];
}

/** Weighing status WeighingMS may write back to OrgaTEX (brief IR-06). */
export type OrgatexWeighingStatus = 'WEIGHING' | 'WEIGHED';

export type OrgatexLinkState = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface OrgatexLinkStatus {
  state: OrgatexLinkState;
  /** Last successful contact with OrgaTEX (shown as "ORGATEX · LINKED hh:mm"). */
  lastContactAt: string | null;
}

export interface OrgatexPort {
  listBatches(stationId: string): Promise<OrgatexBatchQueue>;
  getBatch(batchId: string): Promise<OrgatexBatch>;
  getRecipe(batchId: string): Promise<OrgatexRecipe>;
  listLots(dyestuffCode: string): Promise<OrgatexLot[]>;
  /** Idempotent: the same key and posting always yield the same receipt and one stored posting. */
  postConsumption(
    batchId: string,
    posting: OrgatexConsumptionPosting,
    idempotencyKey: string,
  ): Promise<OrgatexConsumptionReceipt>;
  setBatchStatus(batchId: string, status: OrgatexWeighingStatus): Promise<OrgatexBatch>;
  /** Checks that OrgaTEX answers; refreshes the link status (OFFLINE on failure, never throws). */
  ping(): Promise<OrgatexLinkStatus>;
  getLinkStatus(): OrgatexLinkStatus;
}
