/**
 * Material checks used before a component is unlocked (FR-8, FR-9):
 * lots are verified against OrgaTEX through the port; containers are WeighingMS master data.
 */
import type { ContainerView, LotView } from '../../../shared/materials';
import { normaliseCode } from '../../../shared/scan-codes';
import { ContainerOutOfServiceError, ContainerUnknownError, LotMismatchError } from '../../errors';
import type { OrgatexPort } from '../../integrations/orgatex/orgatex-port';
import type { ContainerRepository } from './container-repository';

export class MaterialService {
  constructor(
    private readonly orgatex: OrgatexPort,
    private readonly containers: ContainerRepository,
  ) {}

  /**
   * The lot is a real OrgaTEX lot of this dyestuff. Errors: LOT_NOT_FOUND (404), LOT_MISMATCH (422),
   * ORGATEX_UNAVAILABLE (503).
   */
  async validateLot(dyestuffCode: string, rawLotId: string): Promise<LotView> {
    const lot = await this.orgatex.findLot(normaliseCode(rawLotId));
    if (lot.dyestuffCode !== dyestuffCode) {
      throw new LotMismatchError(lot.lotId, dyestuffCode, lot.dyestuffCode);
    }
    return { lotId: lot.lotId, dyestuffCode: lot.dyestuffCode };
  }

  /**
   * The lot to weigh with: the scanned lot if there is one (verified against OrgaTEX), otherwise the
   * recipe's suggested lot — which needs no OrgaTEX call, so it works while OrgaTEX is offline (TD-1).
   */
  async resolveLot(
    dyestuffCode: string,
    suggestedLotId: string | null,
    scannedLotId?: string | null,
  ): Promise<string | null> {
    if (scannedLotId && scannedLotId.trim()) {
      return (await this.validateLot(dyestuffCode, scannedLotId)).lotId;
    }
    return suggestedLotId;
  }

  listContainers(): ContainerView[] {
    return this.containers.list();
  }

  /** A known, in-service container. Errors: CONTAINER_UNKNOWN (404), CONTAINER_OUT_OF_SERVICE (422). */
  validateContainer(rawCode: string): ContainerView {
    const containerId = normaliseCode(rawCode);
    const container = this.containers.findById(containerId);
    if (!container) throw new ContainerUnknownError(containerId);
    if (!container.inService) throw new ContainerOutOfServiceError(containerId);
    return container;
  }

  /** The container proposed for a dyestuff (prototype assignment), if one is configured. */
  defaultContainerFor(dyestuffCode: string): ContainerView | null {
    return this.containers.findDefaultFor(dyestuffCode) ?? null;
  }
}
