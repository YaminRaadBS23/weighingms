/**
 * Scale selection and calibration rules (FR-11, FR-12, FR-13, TD-2, BR-24) — pure, no I/O.
 * All arithmetic is exact decimal after unit conversion (NFR-4).
 */
import type { CalibrationState, ScaleDisplayState } from '../scales';
import { add, compare, type Quantity } from '../quantity';

/** What the rules need to know about a scale (structurally satisfied by the ScalePort's ScaleInfo). */
export interface ScaleCandidate {
  scaleId: string;
  capacity: Quantity;
  calibrationDueAt: string;
  connected: boolean;
}

export function isCalibrationExpired(calibrationDueAt: string, now: Date): boolean {
  return Date.parse(calibrationDueAt) < now.getTime();
}

export function calibrationState(scale: ScaleCandidate, now: Date): CalibrationState {
  return isCalibrationExpired(scale.calibrationDueAt, now) ? 'EXPIRED' : 'VALID';
}

export function displayState(scale: ScaleCandidate, now: Date): ScaleDisplayState {
  if (!scale.connected) return 'OFFLINE';
  return calibrationState(scale, now) === 'EXPIRED' ? 'CAL_EXPIRED' : 'READY';
}

/** A scale may be used for weighing only if it is connected and within its calibration date. */
export function isScaleUsable(scale: ScaleCandidate, now: Date): boolean {
  return displayState(scale, now) === 'READY';
}

/** Target + tolerance + container tare, in the target's unit (the load the scale must carry). */
export function scaleRequirement(
  target: Quantity,
  tolerance: Quantity,
  containerTare?: Quantity | null,
): Quantity {
  const withTolerance = add(target, tolerance);
  return containerTare ? add(withTolerance, containerTare) : withTolerance;
}

/** Inclusive: a requirement exactly equal to the capacity fits. */
export function fitsCapacity(requirement: Quantity, scale: ScaleCandidate): boolean {
  return compare(requirement, scale.capacity) <= 0;
}

/**
 * The smallest-capacity usable scale that covers the requirement; ties go to the lowest scale ID.
 * Returns null when no scale qualifies.
 */
export function selectScale<S extends ScaleCandidate>(
  requirement: Quantity,
  scales: readonly S[],
  now: Date,
): S | null {
  const candidates = scales
    .filter((s) => isScaleUsable(s, now) && fitsCapacity(requirement, s))
    .sort((a, b) => compare(a.capacity, b.capacity) || a.scaleId.localeCompare(b.scaleId));
  return candidates[0] ?? null;
}
