import { test } from '@playwright/test';

/**
 * Marks the test as one row of the Step 30 table. `expected` is the defined behaviour; every
 * `observed()` call adds what the run actually saw, and scripts/step30-table.ts prints both.
 */
export function scenario(name: string, expected: string) {
  test.info().annotations.push({ type: 'scenario', description: `${name}\u0000${expected}` });
}

export function observed(text: string) {
  test.info().annotations.push({ type: 'actual', description: text.replace(/\s+/g, ' ').trim() });
}
