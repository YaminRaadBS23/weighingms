import Decimal from 'decimal.js';

/** Units used for weights in WeighingMS. */
export type Unit = 'g' | 'kg';

/**
 * A quantity as it crosses API and storage boundaries: a decimal string plus its unit.
 * Never a JavaScript number (brief NFR-16).
 */
export interface Quantity {
  value: string;
  unit: Unit;
}

const GRAMS_PER_KG = new Decimal(1000);

/** Display precision per unit, as in the prototype: g → 1 decimal, kg → 3 decimals. */
export const DISPLAY_DECIMALS: Record<Unit, number> = { g: 1, kg: 3 };

export function isUnit(value: unknown): value is Unit {
  return value === 'g' || value === 'kg';
}

/** Parses a decimal string; rejects anything that is not a finite decimal. */
export function toDecimal(value: string): Decimal {
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Invalid decimal quantity: "${value}"`);
  }
  return new Decimal(value);
}

export function quantity(value: string, unit: Unit): Quantity {
  toDecimal(value);
  return { value, unit };
}

/** Converts a quantity to another unit exactly. */
export function convert(q: Quantity, to: Unit): Quantity {
  if (q.unit === to) return q;
  const d = toDecimal(q.value);
  const converted = q.unit === 'kg' ? d.times(GRAMS_PER_KG) : d.dividedBy(GRAMS_PER_KG);
  return { value: converted.toString(), unit: to };
}

function inUnitOf(a: Quantity, b: Quantity): [Decimal, Decimal] {
  return [toDecimal(a.value), toDecimal(convert(b, a.unit).value)];
}

/** a + b, expressed in a's unit. */
export function add(a: Quantity, b: Quantity): Quantity {
  const [x, y] = inUnitOf(a, b);
  return { value: x.plus(y).toString(), unit: a.unit };
}

/** a − b, expressed in a's unit. */
export function subtract(a: Quantity, b: Quantity): Quantity {
  const [x, y] = inUnitOf(a, b);
  return { value: x.minus(y).toString(), unit: a.unit };
}

/** Returns -1, 0 or 1 comparing a with b (units may differ). */
export function compare(a: Quantity, b: Quantity): -1 | 0 | 1 {
  const [x, y] = inUnitOf(a, b);
  return x.comparedTo(y) as -1 | 0 | 1;
}

/** Formats with the unit's display precision, e.g. "94.0" (g) or "24.000" (kg). */
export function formatValue(q: Quantity): string {
  return toDecimal(q.value).toFixed(DISPLAY_DECIMALS[q.unit]);
}
