/**
 * Preparation of the active component (ddd-01-domain-model.md): which scale will be used and what
 * has been verified so far. The preparation state is derived from these facts, never stored.
 */
import type { Quantity } from '../../../../shared/quantity';
import type { PreparationState, ScaleMode, ValueSource } from '../../../../shared/weighing';

export interface ScaleAssignment {
  /** null when no usable scale qualifies (reason NO_SUITABLE_SCALE). */
  scaleId: string | null;
  mode: ScaleMode;
  reason: 'NO_SUITABLE_SCALE' | null;
  /** The load the scale must carry: target + tolerance + container tare. */
  requirement: Quantity | null;
}

export interface ChosenLot {
  lotId: string;
  source: ValueSource;
}

export interface ChosenContainer {
  containerId: string;
  /** Tare of the container master when it was chosen. */
  tare: Quantity;
  source: ValueSource;
}

export interface Preparation {
  identityVerifiedAt: string | null;
  lot: ChosenLot | null;
  container: ChosenContainer | null;
  /** The tare the scale reported when weighing was unlocked (TD-8). */
  tareApplied: Quantity | null;
  unlockedAt: string | null;
}

export const noScale = (requirement: Quantity | null = null): ScaleAssignment => ({
  scaleId: null,
  mode: 'AUTO',
  reason: 'NO_SUITABLE_SCALE',
  requirement,
});

export const emptyPreparation = (): Preparation => ({
  identityVerifiedAt: null,
  lot: null,
  container: null,
  tareApplied: null,
  unlockedAt: null,
});

export function preparationStateOf(p: Preparation): PreparationState {
  if (!p.identityVerifiedAt) return 'AWAITING_IDENTITY';
  if (!p.lot || !p.container) return 'AWAITING_MATERIAL';
  return p.tareApplied && p.unlockedAt ? 'UNLOCKED' : 'AWAITING_TARE';
}
