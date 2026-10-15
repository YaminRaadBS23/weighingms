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
