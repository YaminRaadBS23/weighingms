/** Repository interfaces of the weighing context (implemented in infrastructure/). */
import type { AuditEvent } from './audit';
import type { Operator } from './operator';
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
