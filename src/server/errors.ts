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
