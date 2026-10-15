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
