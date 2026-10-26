/**
 * WeighingRecord — the immutable record of one confirmed component (FR-19, NFR-8). Written once at
 * confirmation; there is deliberately no way to change or delete it (see WeighingRecordRepository).
 */
import { toleranceBand } from '../../../../shared/domain/tolerance';
import type { Quantity } from '../../../../shared/quantity';
import { evaluateZone, surplus, type ToleranceZone } from '../../../../shared/domain/tolerance';
import type { OverrideZone, RecordResult } from '../../../../shared/weighing';
import type { ComponentSpec } from './weighing-session';

export interface WeighingRecord {
  readonly recordId: string;
  readonly sessionId: string;
  readonly batchId: string;
  readonly sequence: number;
  readonly dyestuffCode: string;
  readonly dyestuffName: string;
  /** As measured by the scale. */
  readonly actual: Quantity;
  /** Snapshot of the recipe at confirmation, in the recipe's unit. */
  readonly target: Quantity;
  readonly toleranceLower: Quantity;
  readonly toleranceUpper: Quantity;
  readonly lotId: string;
  readonly containerId: string;
  readonly tare: Quantity;
  readonly scaleId: string;
  readonly operatorId: string;
  readonly confirmedAt: string;
  readonly result: RecordResult;
  /** Only for an overridden OVER weight (surplus from the target — TD-10). */
  readonly surplus: { amount: Quantity; percent: string } | null;
  /** Set exactly when `result` is OVERRIDDEN (ADR-9). */
  readonly override: RecordOverride | null;
}

/** A supervisor's authorisation stored on the record (FR-22). */
export interface RecordOverride {
  readonly supervisorId: string;
  readonly reason: string;
  readonly zone: OverrideZone;
  readonly authorisedAt: string;
}

/** What an override adds to a record. */
export interface OverrideInput {
  supervisorId: string;
  reason: string;
}

export interface BuildRecordInput {
  recordId: string;
  sessionId: string;
  batchId: string;
  spec: ComponentSpec;
  actual: Quantity;
  lotId: string;
  containerId: string;
  tare: Quantity;
  scaleId: string;
  operatorId: string;
  confirmedAt: Date;
  /** Present for a supervisor override; the record is then OVERRIDDEN. */
  override?: OverrideInput;
}

/**
 * Builds the record of a confirmation, snapshotting target and limits. With an override it is
 * OVERRIDDEN, keeps the zone and, for an over weight only, the surplus from the target (TD-10).
 */
export function buildRecord(input: BuildRecordInput): WeighingRecord {
  const band = toleranceBand(input.spec);
  const at = input.confirmedAt.toISOString();
  const zone: ToleranceZone | null = input.override ? evaluateZone(input.actual, input.spec) : null;
  if (zone === 'OK') throw new Error('An in-tolerance weight cannot carry an override');
  return {
    recordId: input.recordId,
    sessionId: input.sessionId,
    batchId: input.batchId,
    sequence: input.spec.sequence,
    dyestuffCode: input.spec.dyestuff.code,
    dyestuffName: input.spec.dyestuff.name,
    actual: { ...input.actual },
    target: { ...input.spec.target },
    toleranceLower: band.lower,
    toleranceUpper: band.upper,
    lotId: input.lotId,
    containerId: input.containerId,
    tare: { ...input.tare },
    scaleId: input.scaleId,
    operatorId: input.operatorId,
    confirmedAt: at,
    result: input.override ? 'OVERRIDDEN' : 'IN_TOLERANCE',
    surplus: zone === 'OVER' ? surplus(input.actual, input.spec) : null,
    override:
      input.override && zone
        ? {
            supervisorId: input.override.supervisorId,
            reason: input.override.reason,
            zone,
            authorisedAt: at,
          }
        : null,
  };
}
