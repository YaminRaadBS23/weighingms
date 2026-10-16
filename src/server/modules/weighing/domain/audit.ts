/** AuditEvent — immutable record of a privileged or exceptional action (FR-37, ADR-1). */
import type { AuditEventType } from '../../../../shared/weighing';

export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
  'OVERRIDE',
  'SCALE_RESELECT',
  'ABANDON',
  'REPRINT',
  'WRITEBACK_RETRY',
];

export interface AuditEvent {
  readonly eventId: string;
  readonly sessionId: string | null;
  readonly type: AuditEventType;
  readonly actorId: string;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}
