/** Pure helpers of the Training Panel (no React, no network). */
import { convert, toDecimal, type Quantity, type Unit } from '../../shared/quantity';
import type { SessionView } from '../../shared/weighing';

export interface ActiveTarget {
  sequence: number;
  name: string;
  scaleId: string | null;
  target: Quantity;
  tolerance: Quantity;
}

/** The component being weighed, from the normal session API; null when there is none. */
export function activeTarget(session: SessionView | null): ActiveTarget | null {
  const c = session?.components.find((x) => x.state === 'ACTIVE');
  if (!c) return null;
  return {
    sequence: c.sequence,
    name: c.dyestuff.shortName,
    scaleId: c.scale?.scaleId ?? null,
    target: c.target,
    tolerance: c.tolerance,
  };
}

export type Landing = 'EXACT' | 'OVER';

/**
 * Where a simulated dispense comes to rest: exactly on the target, or clearly over it
 * (target + 3 × tolerance — outside the band by two tolerances), in the target's unit.
 */
export function landingWeight(
  kind: Landing,
  a: Pick<ActiveTarget, 'target' | 'tolerance'>,
): Quantity {
  if (kind === 'EXACT') return { ...a.target };
  const tolerance = toDecimal(convert(a.tolerance, a.target.unit).value);
  return {
    value: toDecimal(a.target.value).plus(tolerance.times(3)).toString(),
    unit: a.target.unit,
  };
}

/** A typed weight as a quantity, or null when it is not a plain decimal. */
export function parseWeight(text: string, unit: Unit): Quantity | null {
  const value = text.trim();
  return /^\d+(\.\d+)?$/.test(value) ? { value, unit } : null;
}
