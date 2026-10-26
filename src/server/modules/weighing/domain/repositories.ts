/** Repository interfaces of the weighing context (implemented in infrastructure/). */
import type { AuditEvent } from './audit';
import type { Operator } from './operator';
import type { WeighingRecord } from './weighing-record';
import type { WeighingSession } from './weighing-session';

export interface OperatorRepository {
  findByBadge(badgeId: string): Operator | undefined;
  findById(operatorId: string): Operator | undefined;
}

export interface StationRepository {
  currentOperatorId(stationId: string): string | null;
  setCurrentOperator(stationId: string, operatorId: string | null, at: string): void;
}

export interface WeighingSessionRepository {
  findById(sessionId: string): WeighingSession | undefined;
  /** The in-progress or suspended session of a batch, if any (at most one). */
  findOpenByBatch(batchId: string): WeighingSession | undefined;
  /** The most recently completed session of a batch, if any (read by the completion context). */
  findCompletedByBatch(batchId: string): WeighingSession | undefined;
  /** Batch ids that have a COMPLETED session. */
  listCompletedBatchIds(): string[];
  /** The station's in-progress session, if any (at most one — ADR-3). */
  findInProgressForStation(stationId: string): WeighingSession | undefined;
  /** Saves the whole aggregate atomically. */
  save(session: WeighingSession): void;
}

/** Append-only: there is deliberately no update or delete (ADR-1). */
export interface AuditEventRepository {
  append(event: AuditEvent): void;
  listBySession(sessionId: string): AuditEvent[];
}

/** Checks a supervisor PIN against a stored hash; never reveals why a check failed (NFR-14). */
export interface PinVerifier {
  /** `storedHash` null means "no PIN on record": the work is still done, the answer is false. */
  verify(pin: string, storedHash: string | null): boolean;
}

/** Append-only: there is deliberately no update or delete (NFR-8, ADR-1 technique). */
export interface WeighingRecordRepository {
  append(record: WeighingRecord): void;
  /** In component (sequence) order. */
  listBySession(sessionId: string): WeighingRecord[];
  findBySessionAndSequence(sessionId: string, sequence: number): WeighingRecord | undefined;
}
