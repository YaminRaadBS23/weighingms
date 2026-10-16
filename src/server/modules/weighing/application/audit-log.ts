/**
 * Use case: record and read the immutable audit trail (FR-37, ADR-1). Callers (override,
 * scale reselection, quit, reprint, write-back retry) arrive in later bolts.
 */
import type { AuditEventType } from '../../../../shared/weighing';
import type { AuditEvent } from '../domain/audit';
import type { WeighingContext } from './context';

export class AuditLog {
  constructor(private readonly ctx: WeighingContext) {}

  record(
    type: AuditEventType,
    actorId: string,
    sessionId: string | null,
    detail: Record<string, unknown> = {},
  ): AuditEvent {
    const event: AuditEvent = {
      eventId: this.ctx.newId(),
      sessionId,
      type,
      actorId,
      detail,
      occurredAt: this.ctx.now().toISOString(),
    };
    this.ctx.audit.append(event);
    this.ctx.logger.info({ event: 'audit', type, actorId, sessionId }, 'Audit event recorded');
    return event;
  }

  listForSession(sessionId: string): AuditEvent[] {
    return this.ctx.audit.listBySession(sessionId);
  }
}
