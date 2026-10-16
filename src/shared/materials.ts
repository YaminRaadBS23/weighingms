/** Contract types of the WeighingMS `/api/materials` and `/api/containers` APIs. */
import type { Quantity } from './quantity';

export interface ValidateLotRequest {
  dyestuffCode: string;
  lotId: string;
}

export interface LotView {
  lotId: string;
  dyestuffCode: string;
}

export interface ContainerView {
  containerId: string;
  type: string;
  /** Empty weight of the container; applied by taring when weighing is unlocked. */
  tare: Quantity;
  inService: boolean;
  /** The dyestuff this container is proposed for by default, or null. */
  defaultFor: string | null;
}

export interface ContainerListResponse {
  items: ContainerView[];
}

export interface ValidateContainerRequest {
  /** Scanned or typed container code. */
  code: string;
}
