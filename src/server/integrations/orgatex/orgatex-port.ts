/**
 * OrgatexPort — WeighingMS' only way to talk to OrgaTEX (brief IR-07).
 * Types here are WeighingMS' view of OrgaTEX data, independent of any OrgaTEX wire format.
 * Errors: BatchNotFoundError, RecipeNotFoundError, DyestuffNotFoundError,
 * OrgatexUnavailableError (503), OrgatexProtocolError (502).
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
  getLinkStatus(): OrgatexLinkStatus;
}
