/** Contract types of the WeighingMS `/api/batches` API, shared by server and station UI. */
import type { BatchStatus } from './domain/batch-selection';
import type { Quantity } from './quantity';

export interface BatchSummary {
  batchId: string;
  orderRef: string;
  machineRef: string;
  /** Shown as "100% CTN knit · 480 kg" in the queue's "Fabric / lot" column. */
  fabric: { description: string; weight: Quantity };
  shade: string;
  componentCount: number;
  status: BatchStatus;
  selectable: boolean;
  reason: string | null;
}

export interface BatchQueueResponse {
  items: BatchSummary[];
  /** When WeighingMS received the queue ("Queue received from OrgaTEX at hh:mm"). */
  receivedAt: string;
}

export interface BatchDetailResponse extends BatchSummary {
  releasedAt: string | null;
}

export interface RecipeComponentResponse {
  sequence: number;
  dyestuff: {
    code: string;
    name: string;
    /** Name printed on the ticket, e.g. "Na2SO4". */
    shortName: string;
    colourHex: string;
    type: string;
  };
  target: Quantity;
  tolerance: Quantity;
  /** Full-scale value of the progress bar. */
  barMax: Quantity;
  suggestedLotId: string | null;
}

export interface RecipeResponse {
  batchId: string;
  recipeId: string;
  shade: string;
  version: string;
  components: RecipeComponentResponse[];
}
