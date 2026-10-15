/**
 * Wire format of the Dummy OrgaTEX HTTP API (`/ext/orgatex/...`).
 * TRAINING CONTRACT ONLY — it makes no claim about the real OrgaTEX interface (brief A-01).
 * WeighingMS code never imports these types; the OrgaTEX adapter maps them to port types.
 */
import type { Quantity } from '../../../../shared/quantity';

export type DummyBatchStatus = 'QUEUED' | 'RELEASED' | 'WEIGHING' | 'WEIGHED';

export interface DummyBatch {
  batchId: string;
  orderRef: string;
  machineRef: string;
  fabricDesc: string;
  fabricWeight: Quantity;
  shade: string;
  componentCount: number;
  status: DummyBatchStatus;
  recipeId: string | null;
  releasedAt: string | null;
}

export interface DummyBatchList {
  items: DummyBatch[];
  generatedAt: string;
}

export interface DummyDyestuff {
  code: string;
  name: string;
  ticketShortName: string;
  colourHex: string;
  type: string;
}

export interface DummyRecipeComponent {
  sequence: number;
  dyestuff: DummyDyestuff;
  target: Quantity;
  tolerance: Quantity;
  barMax: Quantity;
  suggestedLot: string | null;
}

export interface DummyRecipe {
  recipeId: string;
  batchId: string;
  shade: string;
  version: string;
  components: DummyRecipeComponent[];
}

export interface DummyLot {
  lotId: string;
  dyestuffCode: string;
  trainingOnly: boolean;
}

export interface DummyLotList {
  items: DummyLot[];
}

/** One component line of a consumption posting. */
export interface DummyConsumptionLine {
  sequence: number;
  dyestuffCode: string;
  lotId: string | null;
  actual: Quantity;
  target: Quantity;
  /** WeighingMS weighing result, e.g. IN_TOLERANCE or OVERRIDDEN. */
  result: string;
}

/** Body of POST /batches/:batchId/consumption (header Idempotency-Key required). */
export interface DummyConsumptionRequest {
  completedAt: string;
  operatorId: string | null;
  lines: DummyConsumptionLine[];
}

/** What Dummy OrgaTEX stored for a posting; returned on first and repeated posts. */
export interface DummyConsumptionReceipt {
  postingId: string;
  batchId: string;
  idempotencyKey: string;
  operatorId: string | null;
  completedAt: string;
  receivedAt: string;
  lines: DummyConsumptionLine[];
}

export interface DummyConsumptionList {
  items: DummyConsumptionReceipt[];
}

/** Body of PATCH /batches/:batchId/status. */
export interface DummyStatusUpdate {
  status: DummyBatchStatus;
}
