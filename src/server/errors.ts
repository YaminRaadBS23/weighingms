import { ErrorCode, type ErrorBody } from '../shared/errors';

/** Base class for every expected, business-meaningful error. Mapped to HTTP by the app. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export class NotFoundError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 404, details);
  }
}

export class BatchNotFoundError extends NotFoundError {
  constructor(batchId: string) {
    super(ErrorCode.BATCH_NOT_FOUND, `Batch ${batchId} not found`, { batchId });
  }
}

export class RecipeNotFoundError extends NotFoundError {
  constructor(batchId: string) {
    super(ErrorCode.RECIPE_NOT_FOUND, `No recipe available for batch ${batchId}`, { batchId });
  }
}

export class DyestuffNotFoundError extends NotFoundError {
  constructor(code: string) {
    super(ErrorCode.DYESTUFF_NOT_FOUND, `Dyestuff ${code} not found`, { dyestuffCode: code });
  }
}

/** OrgaTEX could not be reached, timed out, or failed (503). */
export class OrgatexUnavailableError extends DomainError {
  constructor(reason: string) {
    super(ErrorCode.ORGATEX_UNAVAILABLE, 'OrgaTEX is not reachable', 503, { reason });
  }
}

/** OrgaTEX answered with something the adapter cannot interpret (502). */
export class OrgatexProtocolError extends DomainError {
  constructor(reason: string) {
    super(ErrorCode.ORGATEX_PROTOCOL_ERROR, 'Unexpected response from OrgaTEX', 502, { reason });
  }
}

/** The batch is not released by OrgaTEX, so it cannot be weighed or posted against (409). */
export class BatchNotReleasedError extends DomainError {
  constructor(batchId: string, reason = 'Not released by OrgaTEX') {
    super(ErrorCode.BATCH_NOT_RELEASED, `Batch ${batchId} cannot be weighed: ${reason}`, 409, {
      batchId,
      reason,
    });
  }
}

/** An idempotency key was reused with a different request (409). */
export class IdempotencyConflictError extends DomainError {
  constructor(key: string) {
    super(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      'Idempotency key already used for a different request',
      409,
      { idempotencyKey: key },
    );
  }
}

/** OrgaTEX refused a batch status change (409). */
export class InvalidStatusTransitionError extends DomainError {
  constructor(batchId: string, reason: string) {
    super(ErrorCode.INVALID_STATUS_TRANSITION, `Invalid status change for batch ${batchId}`, 409, {
      batchId,
      reason,
    });
  }
}

/** OrgaTEX rejected the content of a consumption posting (422). */
export class ConsumptionRejectedError extends DomainError {
  constructor(batchId: string, reason: string) {
    super(ErrorCode.CONSUMPTION_REJECTED, `OrgaTEX rejected the consumption for ${batchId}`, 422, {
      batchId,
      reason,
    });
  }
}

export class ScaleNotFoundError extends NotFoundError {
  constructor(scaleId: string) {
    super(ErrorCode.SCALE_NOT_FOUND, `Scale ${scaleId} not found`, { scaleId });
  }
}

/** The scale is disconnected, not responding, or timed out (503). */
export class ScaleUnavailableError extends DomainError {
  constructor(scaleId: string, reason: string) {
    super(ErrorCode.SCALE_UNAVAILABLE, `Scale ${scaleId} is not responding`, 503, {
      scaleId,
      reason,
    });
  }
}

/** The scale answered with something the adapter cannot interpret (502). */
export class ScaleProtocolError extends DomainError {
  constructor(scaleId: string, reason: string) {
    super(ErrorCode.SCALE_PROTOCOL_ERROR, 'Unexpected response from scale', 502, {
      scaleId,
      reason,
    });
  }
}

/** The barcode scanner is offline or not responding (503). */
export class ScannerUnavailableError extends DomainError {
  constructor(reason: string) {
    super(ErrorCode.SCANNER_UNAVAILABLE, 'Scanner is not available', 503, { reason });
  }
}

/** The ticket printer cannot print right now; `state` says why (503). */
export class PrinterUnavailableError extends DomainError {
  constructor(
    readonly state: 'OFFLINE' | 'OUT_OF_PAPER',
    reason: string,
  ) {
    super(ErrorCode.PRINTER_UNAVAILABLE, `Printer unavailable (${state})`, 503, { state, reason });
  }
}

/** The scanner or printer answered with something the adapter cannot interpret (502). */
export class DeviceProtocolError extends DomainError {
  constructor(device: string, reason: string) {
    super(ErrorCode.DEVICE_PROTOCOL_ERROR, `Unexpected response from ${device}`, 502, {
      device,
      reason,
    });
  }
}

export class LotNotFoundError extends NotFoundError {
  constructor(lotId: string) {
    super(ErrorCode.LOT_NOT_FOUND, `Lot ${lotId} not found`, { lotId });
  }
}

/** The lot exists but belongs to another dyestuff (422). */
export class LotMismatchError extends DomainError {
  constructor(lotId: string, dyestuffCode: string, lotDyestuffCode: string) {
    super(ErrorCode.LOT_MISMATCH, `Lot ${lotId} is not a lot of dyestuff ${dyestuffCode}`, 422, {
      lotId,
      dyestuffCode,
      lotDyestuffCode,
    });
  }
}

export class ContainerUnknownError extends NotFoundError {
  constructor(containerId: string) {
    super(ErrorCode.CONTAINER_UNKNOWN, `Container ${containerId} not found`, { containerId });
  }
}

export class ContainerOutOfServiceError extends DomainError {
  constructor(containerId: string) {
    super(ErrorCode.CONTAINER_OUT_OF_SERVICE, `Container ${containerId} is out of service`, 422, {
      containerId,
    });
  }
}
