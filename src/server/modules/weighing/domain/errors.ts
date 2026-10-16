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
