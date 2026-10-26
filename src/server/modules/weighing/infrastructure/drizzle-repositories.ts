/** Drizzle/SQLite implementations of the weighing repositories (weighingms.db). */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { WeighingDb } from '../../../db/weighingms/db';
import {
  auditEvents,
  componentWeighings,
  operators,
  stationState,
  weighingRecords,
  weighingSessions,
} from '../../../db/weighingms/schema';
import type { AuditEvent } from '../domain/audit';
import type { Operator } from '../domain/operator';
import type {
  AuditEventRepository,
  OperatorRepository,
  StationRepository,
  WeighingRecordRepository,
  WeighingSessionRepository,
} from '../domain/repositories';
import type { WeighingRecord } from '../domain/weighing-record';
import type { Preparation, ScaleAssignment } from '../domain/preparation';
import {
  WeighingSession,
  type ComponentWeighing,
  type RecipeSnapshot,
} from '../domain/weighing-session';
import { isUnit, type Quantity } from '../../../../shared/quantity';
import type { OverrideZone } from '../../../../shared/weighing';
import type {
  AuditEventType,
  ComponentState,
  OperatorRole,
  OrgatexStatusSync,
  ScaleMode,
  SessionStatus,
  ValueSource,
} from '../../../../shared/weighing';

function toOperator(row: typeof operators.$inferSelect): Operator {
  return { ...row, role: row.role as OperatorRole };
}

export class DrizzleOperatorRepository implements OperatorRepository {
  constructor(private readonly db: WeighingDb) {}

  findByBadge(badgeId: string): Operator | undefined {
    const row = this.db.select().from(operators).where(eq(operators.badgeId, badgeId)).get();
    return row && toOperator(row);
  }

  findById(operatorId: string): Operator | undefined {
    const row = this.db.select().from(operators).where(eq(operators.operatorId, operatorId)).get();
    return row && toOperator(row);
  }
}

export class DrizzleStationRepository implements StationRepository {
  constructor(private readonly db: WeighingDb) {}

  currentOperatorId(stationId: string): string | null {
    return (
      this.db.select().from(stationState).where(eq(stationState.stationId, stationId)).get()
        ?.currentOperatorId ?? null
    );
  }

  setCurrentOperator(stationId: string, operatorId: string | null, at: string): void {
    this.db
      .insert(stationState)
      .values({ stationId, currentOperatorId: operatorId, signedInAt: operatorId ? at : null })
      .onConflictDoUpdate({
        target: stationState.stationId,
        set: { currentOperatorId: operatorId, signedInAt: operatorId ? at : null },
      })
      .run();
  }
}

const OPEN: SessionStatus[] = ['IN_PROGRESS', 'SUSPENDED'];

export class DrizzleWeighingSessionRepository implements WeighingSessionRepository {
  constructor(private readonly db: WeighingDb) {}

  findById(sessionId: string): WeighingSession | undefined {
    return this.load(eq(weighingSessions.sessionId, sessionId));
  }

  findOpenByBatch(batchId: string): WeighingSession | undefined {
    return this.load(
      and(eq(weighingSessions.batchId, batchId), inArray(weighingSessions.status, OPEN)),
    );
  }

  findCompletedByBatch(batchId: string): WeighingSession | undefined {
    const row = this.db
      .select({ sessionId: weighingSessions.sessionId })
      .from(weighingSessions)
      .where(and(eq(weighingSessions.batchId, batchId), eq(weighingSessions.status, 'COMPLETED')))
      .orderBy(desc(weighingSessions.completedAt))
      .get();
    return row ? this.findById(row.sessionId) : undefined;
  }

  listCompletedBatchIds(): string[] {
    return this.db
      .selectDistinct({ batchId: weighingSessions.batchId })
      .from(weighingSessions)
      .where(eq(weighingSessions.status, 'COMPLETED'))
      .orderBy(asc(weighingSessions.batchId))
      .all()
      .map((r) => r.batchId);
  }

  findInProgressForStation(stationId: string): WeighingSession | undefined {
    return this.load(
      and(eq(weighingSessions.stationId, stationId), eq(weighingSessions.status, 'IN_PROGRESS')),
    );
  }

  /** Session row and all component rows in one transaction (NFR-5). */
  save(session: WeighingSession): void {
    const s = session.snapshot();
    this.db.transaction((tx) => {
      const row = {
        sessionId: s.sessionId,
        batchId: s.batchId,
        stationId: s.stationId,
        startedBy: s.startedBy,
        status: s.status,
        recipeSnapshot: JSON.stringify(s.recipe),
        orgatexStatusSync: s.orgatexStatusSync,
        startedAt: s.startedAt,
        updatedAt: s.updatedAt,
        completedAt: s.completedAt,
      };
      tx.insert(weighingSessions)
        .values(row)
        .onConflictDoUpdate({ target: weighingSessions.sessionId, set: row })
        .run();
      for (const c of s.components) {
        tx.insert(componentWeighings)
          .values({ sessionId: s.sessionId, ...toRow(c) })
          .onConflictDoUpdate({
            target: [componentWeighings.sessionId, componentWeighings.sequence],
            set: toRow(c),
          })
          .run();
      }
    });
  }

  private load(where: ReturnType<typeof eq> | undefined): WeighingSession | undefined {
    const row = this.db.select().from(weighingSessions).where(where).get();
    if (!row) return undefined;
    const components = this.db
      .select()
      .from(componentWeighings)
      .where(eq(componentWeighings.sessionId, row.sessionId))
      .orderBy(asc(componentWeighings.sequence))
      .all();
    return WeighingSession.restore({
      sessionId: row.sessionId,
      batchId: row.batchId,
      stationId: row.stationId,
      startedBy: row.startedBy,
      status: row.status as SessionStatus,
      recipe: JSON.parse(row.recipeSnapshot) as RecipeSnapshot,
      components: components.map(fromRow),
      orgatexStatusSync: row.orgatexStatusSync as OrgatexStatusSync,
      startedAt: row.startedAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    });
  }
}

type ComponentRow = typeof componentWeighings.$inferSelect;

const quantityOf = (value: string | null, unit: string | null): Quantity | null =>
  value !== null && isUnit(unit) ? { value, unit } : null;

/** Columns of one component; all preparation columns are null unless the component is ACTIVE. */
function toRow(c: ComponentWeighing) {
  const s = c.scale;
  const p = c.preparation;
  return {
    sequence: c.sequence,
    state: c.state,
    activatedAt: c.activatedAt,
    scaleId: s?.scaleId ?? null,
    scaleMode: s?.mode ?? null,
    scaleReason: s?.reason ?? null,
    requirementValue: s?.requirement?.value ?? null,
    requirementUnit: s?.requirement?.unit ?? null,
    identityVerifiedAt: p?.identityVerifiedAt ?? null,
    lotId: p?.lot?.lotId ?? null,
    lotSource: p?.lot?.source ?? null,
    containerId: p?.container?.containerId ?? null,
    containerSource: p?.container?.source ?? null,
    containerTareValue: p?.container?.tare.value ?? null,
    containerTareUnit: p?.container?.tare.unit ?? null,
    tareValue: p?.tareApplied?.value ?? null,
    tareUnit: p?.tareApplied?.unit ?? null,
    unlockedAt: p?.unlockedAt ?? null,
  };
}

function fromRow(c: ComponentRow): ComponentWeighing {
  const active = c.state === 'ACTIVE';
  // An active component saved before bolt 009 has no columns: it loads as "no scale, nothing verified".
  const scale: ScaleAssignment | null = !active
    ? null
    : {
        scaleId: c.scaleId,
        mode: (c.scaleMode as ScaleMode | null) ?? 'AUTO',
        reason: c.scaleId ? null : 'NO_SUITABLE_SCALE',
        requirement: quantityOf(c.requirementValue, c.requirementUnit),
      };
  const containerTare = quantityOf(c.containerTareValue, c.containerTareUnit);
  const preparation: Preparation | null = !active
    ? null
    : {
        identityVerifiedAt: c.identityVerifiedAt,
        lot: c.lotId ? { lotId: c.lotId, source: (c.lotSource as ValueSource) ?? 'DEFAULT' } : null,
        container:
          c.containerId && containerTare
            ? {
                containerId: c.containerId,
                tare: containerTare,
                source: (c.containerSource as ValueSource) ?? 'DEFAULT',
              }
            : null,
        tareApplied: quantityOf(c.tareValue, c.tareUnit),
        unlockedAt: c.unlockedAt,
      };
  return {
    sequence: c.sequence,
    state: c.state as ComponentState,
    activatedAt: c.activatedAt,
    scale,
    preparation,
  };
}

export class DrizzleAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: WeighingDb) {}

  append(event: AuditEvent): void {
    this.db
      .insert(auditEvents)
      .values({ ...event, detail: JSON.stringify(event.detail) })
      .run();
  }

  listBySession(sessionId: string): AuditEvent[] {
    return this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.sessionId, sessionId))
      .orderBy(asc(auditEvents.occurredAt), asc(sql`rowid`)) // ties: insertion order (IDs are random)
      .all()
      .map((r) => ({
        ...r,
        type: r.type as AuditEventType,
        detail: JSON.parse(r.detail) as Record<string, unknown>,
      }));
  }
}

type RecordRow = typeof weighingRecords.$inferSelect;

const q = (value: string, unit: string): Quantity => ({ value, unit: unit as Quantity['unit'] });

function recordFromRow(r: RecordRow): WeighingRecord {
  return {
    recordId: r.recordId,
    sessionId: r.sessionId,
    batchId: r.batchId,
    sequence: r.sequence,
    dyestuffCode: r.dyestuffCode,
    dyestuffName: r.dyestuffName,
    actual: q(r.actualValue, r.actualUnit),
    target: q(r.targetValue, r.targetUnit),
    toleranceLower: q(r.tolLowerValue, r.tolLowerUnit),
    toleranceUpper: q(r.tolUpperValue, r.tolUpperUnit),
    lotId: r.lotId,
    containerId: r.containerId,
    tare: q(r.tareValue, r.tareUnit),
    scaleId: r.scaleId,
    operatorId: r.operatorId,
    confirmedAt: r.confirmedAt,
    result: r.result as WeighingRecord['result'],
    surplus:
      r.surplusValue !== null && r.surplusUnit !== null && r.surplusPercent !== null
        ? { amount: q(r.surplusValue, r.surplusUnit), percent: r.surplusPercent }
        : null,
    override:
      r.overrideSupervisorId !== null
        ? {
            supervisorId: r.overrideSupervisorId,
            reason: r.overrideReason!,
            zone: r.overrideZone as OverrideZone,
            authorisedAt: r.overrideAt!,
          }
        : null,
  };
}

/** Append-only: no update or delete method exists, and the database triggers refuse both. */
export class DrizzleWeighingRecordRepository implements WeighingRecordRepository {
  constructor(private readonly db: WeighingDb) {}

  append(r: WeighingRecord): void {
    this.db
      .insert(weighingRecords)
      .values({
        recordId: r.recordId,
        sessionId: r.sessionId,
        batchId: r.batchId,
        sequence: r.sequence,
        dyestuffCode: r.dyestuffCode,
        dyestuffName: r.dyestuffName,
        actualValue: r.actual.value,
        actualUnit: r.actual.unit,
        targetValue: r.target.value,
        targetUnit: r.target.unit,
        tolLowerValue: r.toleranceLower.value,
        tolLowerUnit: r.toleranceLower.unit,
        tolUpperValue: r.toleranceUpper.value,
        tolUpperUnit: r.toleranceUpper.unit,
        lotId: r.lotId,
        containerId: r.containerId,
        tareValue: r.tare.value,
        tareUnit: r.tare.unit,
        scaleId: r.scaleId,
        operatorId: r.operatorId,
        confirmedAt: r.confirmedAt,
        result: r.result,
        surplusValue: r.surplus?.amount.value ?? null,
        surplusUnit: r.surplus?.amount.unit ?? null,
        surplusPercent: r.surplus?.percent ?? null,
        overrideSupervisorId: r.override?.supervisorId ?? null,
        overrideReason: r.override?.reason ?? null,
        overrideZone: r.override?.zone ?? null,
        overrideAt: r.override?.authorisedAt ?? null,
      })
      .run();
  }

  listBySession(sessionId: string): WeighingRecord[] {
    return this.db
      .select()
      .from(weighingRecords)
      .where(eq(weighingRecords.sessionId, sessionId))
      .orderBy(asc(weighingRecords.sequence))
      .all()
      .map(recordFromRow);
  }

  findBySessionAndSequence(sessionId: string, sequence: number): WeighingRecord | undefined {
    const row = this.db
      .select()
      .from(weighingRecords)
      .where(and(eq(weighingRecords.sessionId, sessionId), eq(weighingRecords.sequence, sequence)))
      .get();
    return row && recordFromRow(row);
  }
}
