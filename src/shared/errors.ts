/** Stable error codes shared by the server and the UI (api-conventions.md). */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BATCH_NOT_FOUND: 'BATCH_NOT_FOUND',
  RECIPE_NOT_FOUND: 'RECIPE_NOT_FOUND',
  DYESTUFF_NOT_FOUND: 'DYESTUFF_NOT_FOUND',
  ORGATEX_UNAVAILABLE: 'ORGATEX_UNAVAILABLE',
  ORGATEX_PROTOCOL_ERROR: 'ORGATEX_PROTOCOL_ERROR',
  BATCH_NOT_RELEASED: 'BATCH_NOT_RELEASED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  CONSUMPTION_REJECTED: 'CONSUMPTION_REJECTED',
  SCALE_NOT_FOUND: 'SCALE_NOT_FOUND',
  SCALE_UNAVAILABLE: 'SCALE_UNAVAILABLE',
  SCALE_PROTOCOL_ERROR: 'SCALE_PROTOCOL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Body of every error response, WeighingMS and Dummy APIs alike. */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
