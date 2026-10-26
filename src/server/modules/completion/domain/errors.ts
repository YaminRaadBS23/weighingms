import { ErrorCode } from '../../../../shared/errors';
import { DomainError, NotFoundError } from '../../../errors';

/**
 * The batch is not completed. The consumption and retry calls answer 422, the read calls 409
 * (as the stories 001 and 003 state them).
 */
export class WriteBackBatchIncompleteError extends DomainError {
  constructor(httpStatus: 409 | 422, done: number, total: number) {
    super(
      ErrorCode.BATCH_INCOMPLETE,
      `Only ${done} of ${total} components are weighed`,
      httpStatus,
      {
        done,
        total,
      },
    );
  }
}

export class WriteBackKeyMismatchError extends DomainError {
  constructor(batchId: string) {
    super(
      ErrorCode.WRITEBACK_KEY_MISMATCH,
      `Batch ${batchId} already has a write-back with a different idempotency key`,
      409,
      { batchId },
    );
  }
}

export class WriteBackNotFoundError extends NotFoundError {
  constructor(batchId: string) {
    super(ErrorCode.WRITEBACK_NOT_FOUND, `No write-back has been requested for batch ${batchId}`, {
      batchId,
    });
  }
}

export class InvalidIdempotencyKeyError extends DomainError {
  constructor() {
    super(
      ErrorCode.VALIDATION_ERROR,
      'Idempotency-Key must be 1–128 printable characters without spaces at the ends',
      400,
    );
  }
}
