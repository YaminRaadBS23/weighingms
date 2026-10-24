/** Domain errors of the weighing context (mapped to HTTP by the central error handler). */
import { ErrorCode } from '../../../../shared/errors';
import { DomainError, NotFoundError } from '../../../errors';

export class OperatorUnknownError extends DomainError {
  constructor() {
    super(ErrorCode.OPERATOR_UNKNOWN, 'Badge not recognised or operator inactive', 401);
  }
}

export class NotSignedInError extends DomainError {
  constructor() {
    super(ErrorCode.NOT_SIGNED_IN, 'No operator is signed in at this station', 401);
  }
}

/** ADR-3: one batch in progress per station. */
export class SessionInProgressError extends DomainError {
  constructor(sessionId: string, batchId: string) {
    super(
      ErrorCode.SESSION_IN_PROGRESS,
      `Batch ${batchId} is in progress at this station; quit it before starting another batch`,
      409,
      { sessionId, batchId },
    );
  }
}

export class SessionNotFoundError extends NotFoundError {
  constructor(sessionId: string) {
    super(ErrorCode.SESSION_NOT_FOUND, `Weighing session ${sessionId} not found`, { sessionId });
  }
}

export class SessionNotInProgressError extends DomainError {
  constructor(sessionId: string, status: string) {
    super(ErrorCode.SESSION_NOT_IN_PROGRESS, `Weighing session is ${status}`, 409, {
      sessionId,
      status,
    });
  }
}

export class ComponentNotFoundError extends NotFoundError {
  constructor(sessionId: string, sequence: number) {
    super(ErrorCode.COMPONENT_NOT_FOUND, `Component ${sequence} not found`, {
      sessionId,
      sequence,
    });
  }
}

export class ComponentAlreadyDoneError extends DomainError {
  constructor(sessionId: string, sequence: number) {
    super(ErrorCode.COMPONENT_ALREADY_DONE, `Component ${sequence} is already weighed`, 409, {
      sessionId,
      sequence,
    });
  }
}

/** The scanned dyestuff is not the one this component needs (422). */
export class WrongDyestuffError extends DomainError {
  constructor(expected: string, scanned: string) {
    super(ErrorCode.WRONG_DYESTUFF, `Wrong dyestuff: this component needs ${expected}`, 422, {
      expected,
      scanned,
    });
  }
}

/** Preparation or weighing was attempted on a component that is not the active one (409). */
export class ComponentNotActiveError extends DomainError {
  constructor(sessionId: string, sequence: number) {
    super(
      ErrorCode.COMPONENT_NOT_ACTIVE,
      `Component ${sequence} is not the active component`,
      409,
      {
        sessionId,
        sequence,
      },
    );
  }
}

/** Weighing is locked until the dyestuff is verified and the scale tared (409). */
export class IdentityNotVerifiedError extends DomainError {
  constructor(sessionId: string, sequence: number) {
    super(
      ErrorCode.IDENTITY_NOT_VERIFIED,
      `Component ${sequence} is locked: verify the dyestuff first`,
      409,
      { sessionId, sequence },
    );
  }
}

/** No usable scale can carry the component's requirement (422). */
export class NoSuitableScaleError extends DomainError {
  constructor(requirement: { value: string; unit: string }) {
    super(ErrorCode.NO_SUITABLE_SCALE, 'No usable scale can carry this component', 422, {
      requirement,
    });
  }
}

/** The chosen scale cannot carry the component's requirement (422). */
export class ScaleCapacityInsufficientError extends DomainError {
  constructor(scaleId: string, requirement: { value: string; unit: string }) {
    super(
      ErrorCode.SCALE_CAPACITY_INSUFFICIENT,
      `Scale ${scaleId} cannot carry this component`,
      422,
      { scaleId, requirement },
    );
  }
}

/** The scale's calibration date has passed (422, BR-24). */
export class ScaleCalibrationExpiredError extends DomainError {
  constructor(scaleId: string, calibrationDueAt: string) {
    super(ErrorCode.SCALE_CALIBRATION_EXPIRED, `Scale ${scaleId} calibration has expired`, 422, {
      scaleId,
      calibrationDueAt,
    });
  }
}

/** Not a supervisor, or wrong PIN — deliberately no detail (403, NFR-14). */
export class NotAuthorisedError extends DomainError {
  constructor() {
    super(ErrorCode.NOT_AUTHORISED, 'Supervisor authorisation failed', 403);
  }
}
