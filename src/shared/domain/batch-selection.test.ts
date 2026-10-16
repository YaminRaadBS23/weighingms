import { describe, expect, it } from 'vitest';
import { batchSelectability } from './batch-selection';

describe('batch selection rule', () => {
  it.each([
    ['RELEASED', true, { selectable: true, reason: null }],
    ['WEIGHING', true, { selectable: true, reason: null }],
    ['QUEUED', false, { selectable: false, reason: 'Not released by OrgaTEX' }],
    ['QUEUED', true, { selectable: false, reason: 'Not released by OrgaTEX' }],
    ['WEIGHED', true, { selectable: false, reason: 'Already weighed' }],
    ['RELEASED', false, { selectable: false, reason: 'No recipe available' }],
  ] as const)('%s (recipe: %s) → %o', (status, hasRecipe, expected) => {
    expect(batchSelectability(status, hasRecipe)).toEqual(expected);
  });
});
