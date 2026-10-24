/**
 * WeighingRecord — the immutable record of one confirmed component (FR-19, NFR-8). Written once at
 * confirmation; there is deliberately no way to change or delete it (see WeighingRecordRepository).
 */
import { toleranceBand } from '../../../../shared/domain/tolerance';
import type { Quantity } from '../../../../shared/quantity';
import type { RecordResult } from '../../../../shared/weighing';
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
  /** Filled from bolt 012 on (overshoot / override). */
  readonly surplus: { amount: Quantity; percent: string } | null;
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
}

/** Builds the record of an in-tolerance confirmation, snapshotting target and limits. */
export function buildRecord(input: BuildRecordInput): WeighingRecord {
  const band = toleranceBand(input.spec);
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
    confirmedAt: input.confirmedAt.toISOString(),
    result: 'IN_TOLERANCE',
    surplus: null,
  };
}
