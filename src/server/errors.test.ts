import { describe, expect, it } from 'vitest';
import {
  BatchNotFoundError,
  DyestuffNotFoundError,
  OrgatexProtocolError,
  OrgatexUnavailableError,
  RecipeNotFoundError,
} from './errors';

describe('DomainError mapping', () => {
  it.each([
    [new BatchNotFoundError('B-1'), 404, 'BATCH_NOT_FOUND'],
    [new RecipeNotFoundError('B-1'), 404, 'RECIPE_NOT_FOUND'],
    [new DyestuffNotFoundError('X'), 404, 'DYESTUFF_NOT_FOUND'],
    [new OrgatexUnavailableError('down'), 503, 'ORGATEX_UNAVAILABLE'],
    [new OrgatexProtocolError('bad'), 502, 'ORGATEX_PROTOCOL_ERROR'],
  ])('%s maps to HTTP %i with code %s', (error, status, code) => {
    expect(error.httpStatus).toBe(status);
    expect(error.toBody().error.code).toBe(code);
    expect(typeof error.toBody().error.message).toBe('string');
  });

  it('includes details only when present', () => {
    expect(new BatchNotFoundError('B-9').toBody()).toEqual({
      error: {
        code: 'BATCH_NOT_FOUND',
        message: 'Batch B-9 not found',
        details: { batchId: 'B-9' },
      },
    });
  });
});
