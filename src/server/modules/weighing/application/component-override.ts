/**
 * Use case: a supervisor authorises recording a weight outside tolerance (FR-22, ADR-9, TD-10).
 *
 * Order (ddd-01): reason present → operator signed in → supervisor authorised (before any scale
 * access) → under the session lock: measure once → stable → weight above zero → zone not OK →
 * OVERRIDDEN record + component DONE + next ACTIVE + `OVERRIDE` audit event in one transaction.
 * The server measures: the command carries no weight (ADR-7). Nothing is recalculated: no other
 * component changes because of an overshoot (Step 24).
 */
import { evaluateZone, isOverridable } from '../../../../shared/domain/tolerance';
import { DomainError } from '../../../errors';
import {
  NothingToOverrideError,
  OverrideNotNeededError,
  ReadingUnstableError,
  ReasonRequiredError,
  SessionNotFoundError,
} from '../domain/errors';
import { buildRecord } from '../domain/weighing-record';
import type { ConfirmationResult } from './component-confirmation';
import type { ComponentMeasurement } from './component-measurement';
import type { ComponentPreparation } from './component-preparation';
import type { WeighingContext } from './context';
import type { AuditLog } from './audit-log';
import type { OperatorIdentification } from './operator-identification';
import type { SupervisorAuthorisationService } from './supervisor-authorisation';

export interface OverrideCommand {
  supervisorBadge: string;
  pin: string;
  reason: string;
}

export class ComponentOverride {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly measurement: ComponentMeasurement,
    private readonly preparation: ComponentPreparation,
    private readonly identification: OperatorIdentification,
    private readonly authorisation: SupervisorAuthorisationService,
    private readonly auditLog: AuditLog,
  ) {}

  async override(
    sessionId: string,
    sequence: number,
    command: OverrideCommand,
  ): Promise<ConfirmationResult> {
    const reason = command.reason.trim();
    if (!reason) throw new ReasonRequiredError();
    const operator = this.identification.requireCurrent();
    const supervisor = this.authorisation.authorise(command.supervisorBadge, command.pin);

    return this.preparation.lock.run(sessionId, async () => {
      try {
        const session = this.ctx.sessions.findById(sessionId);
        if (!session) throw new SessionNotFoundError(sessionId);

        const { scaleId, spec, reading } = await this.measurement.measure(session, sequence);
        if (!reading.stable) throw new ReadingUnstableError(scaleId);
        const zone = evaluateZone(reading.net, spec);
        if (zone === 'OK') throw new OverrideNotNeededError({ zone, weight: reading.net });
        if (!isOverridable(zone, reading.net)) throw new NothingToOverrideError(reading.net);

        const now = this.ctx.now();
        const prep = session.activeSnapshot(sequence).preparation!;
        const record = buildRecord({
          recordId: this.ctx.newId(),
          sessionId,
          batchId: session.batchId,
          spec,
          actual: reading.net,
          lotId: prep.lot!.lotId,
          containerId: prep.container!.containerId,
          tare: prep.tareApplied!,
          scaleId,
          operatorId: operator.operatorId,
          confirmedAt: now,
          override: { supervisorId: supervisor.operatorId, reason },
        });

        const next = session.confirm(sequence, now);
        if (next !== null) await this.preparation.assignScale(session, next);

        // One transaction: record, state and audit event are stored together, or none (NFR-5).
        this.ctx.atomically(() => {
          this.ctx.records.append(record);
          this.ctx.sessions.save(session);
          this.auditLog.record('OVERRIDE', supervisor.operatorId, sessionId, {
            sequence,
            dyestuffCode: spec.dyestuff.code,
            recordId: record.recordId,
            actual: record.actual,
            target: record.target,
            zone,
            surplus: record.surplus,
            reason,
            operatorId: operator.operatorId,
          });
        });

        // The reason is free text and stays out of the log; it is in the record and the audit event.
        this.ctx.logger.info(
          {
            event: 'override-authorised',
            sessionId,
            sequence,
            recordId: record.recordId,
            supervisorId: supervisor.operatorId,
            zone,
          },
          'Override authorised',
        );
        return { record, session };
      } catch (err) {
        if (err instanceof DomainError) {
          this.ctx.logger.warn(
            { event: 'override-refused', sessionId, sequence, reason: err.code },
            'Override refused',
          );
        }
        throw err;
      }
    });
  }
}
