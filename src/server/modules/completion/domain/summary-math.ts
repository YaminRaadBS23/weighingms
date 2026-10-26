/** Pure arithmetic of the completion summary; decimals only, never floating point (NFR-4). */
import { add, convert, quantity, toDecimal, type Quantity } from '../../../../shared/quantity';

/** Exact sum of the actuals in kg ("35.322" kg), whatever unit each was measured in. */
export function totalDispensedKg(actuals: readonly Quantity[]): Quantity {
  const kg = actuals.reduce<Quantity>((sum, a) => add(sum, a), quantity('0', 'kg'));
  const rounded = toDecimal(convert(kg, 'kg').value).toFixed(3);
  return { value: rounded, unit: 'kg' };
}

/** True when no record needed a supervisor override. */
export function allWithinTolerance(results: readonly string[]): boolean {
  return results.every((r) => r !== 'OVERRIDDEN');
}

/** Whole seconds from session start to completion (assumption Q-UI-14). */
export function elapsedSeconds(startedAt: string, completedAt: string): number {
  return Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000));
}
