/**
 * Tolerance evaluation (FR-17, FR-20, TD-5) — pure, no I/O. The server decides with these
 * functions and the station UI displays with the same ones, so they cannot disagree.
 * All arithmetic is exact decimal after unit conversion (NFR-4).
 */
import Decimal from 'decimal.js';
import { add, convert, subtract, toDecimal, type Quantity } from '../quantity';

export type ToleranceZone = 'UNDER' | 'NEAR' | 'OK' | 'OVER';

/** What the rules need to know about a component. */
export interface ToleranceSpec {
  target: Quantity;
  /** Absolute ± around the target (TD-5). */
  tolerance: Quantity;
}

/** From this fraction of the target upwards, an under-weight counts as "near". */
const NEAR_FRACTION = new Decimal('0.9');

/** [target − tol, target + tol], in the target's unit. Limits are inclusive. */
export function toleranceBand(spec: ToleranceSpec): { lower: Quantity; upper: Quantity } {
  return {
    lower: subtract(spec.target, spec.tolerance),
    upper: add(spec.target, spec.tolerance),
  };
}

/**
 * OK: lower ≤ weight ≤ upper · OVER: above the band · NEAR: below the band but at least 90 % of the
 * target · UNDER: below 90 % of the target, including zero and negative weights.
 */
export function evaluateZone(weight: Quantity, spec: ToleranceSpec): ToleranceZone {
  const w = toDecimal(convert(weight, spec.target.unit).value);
  const { lower, upper } = toleranceBand(spec);
  if (w.greaterThan(toDecimal(upper.value))) return 'OVER';
  if (w.greaterThanOrEqualTo(toDecimal(lower.value))) return 'OK';
  const nearFrom = toDecimal(spec.target.value).times(NEAR_FRACTION);
  return w.greaterThanOrEqualTo(nearFrom) && w.greaterThan(0) ? 'NEAR' : 'UNDER';
}

/** Only a weight inside the band may be confirmed (before any override, bolt 012). */
export function isConfirmable(zone: ToleranceZone): boolean {
  return zone === 'OK';
}

export interface Surplus {
  /** weight − target, in the target's unit. */
  amount: Quantity;
  /** amount ÷ target × 100, one decimal, rounded half up. */
  percent: string;
}

/**
 * By how much a weight exceeds the target: "+2.4 g (+2.6 %)". The reference point (the target) is
 * defined here only, so the overshoot decision of workbook Step 24 can change it in one place.
 */
export function surplus(weight: Quantity, spec: ToleranceSpec): Surplus {
  const amount = subtract(
    { value: convert(weight, spec.target.unit).value, unit: spec.target.unit },
    spec.target,
  );
  const percent = toDecimal(amount.value)
    .dividedBy(toDecimal(spec.target.value))
    .times(100)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    .toFixed(1);
  return { amount, percent };
}
