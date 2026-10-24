/** Contract types of the WeighingMS `/api/operators` and `/api/sessions` APIs, shared with the UI. */
import type { Quantity } from './quantity';

export type OperatorRole = 'OPERATOR' | 'SUPERVISOR';

export interface OperatorView {
  operatorId: string;
  badgeId: string;
  name: string;
  shift: string;
  role: OperatorRole;
}

export interface SignInRequest {
  badge: string;
}

export interface CurrentOperatorResponse {
  operator: OperatorView | null;
}

export type SessionStatus = 'IN_PROGRESS' | 'SUSPENDED' | 'COMPLETED';
export type ComponentState = 'PENDING' | 'ACTIVE' | 'DONE';
/** Whether OrgaTEX has been told the batch is being weighed (deferred while OrgaTEX is offline). */
export type OrgatexStatusSync = 'SYNCED' | 'DEFERRED';

export type ScaleMode = 'AUTO' | 'MANUAL';
export type ValueSource = 'DEFAULT' | 'SCANNED';
export type PreparationState =
  'AWAITING_IDENTITY' | 'AWAITING_MATERIAL' | 'AWAITING_TARE' | 'UNLOCKED';

export interface ScaleAssignmentView {
  /** null when no usable scale qualifies. */
  scaleId: string | null;
  mode: ScaleMode;
  reason: 'NO_SUITABLE_SCALE' | null;
}

/** Why a prepared component is still locked (the call itself was accepted — ADR-5). */
export interface PreparationIssue {
  code: string;
  message: string;
}

export interface PreparationView {
  state: PreparationState;
  identityVerified: boolean;
  lot: { lotId: string; source: ValueSource } | null;
  container: { containerId: string; tare: Quantity; source: ValueSource } | null;
  tareApplied: Quantity | null;
  issue?: PreparationIssue;
}

export type RecordResult = 'IN_TOLERANCE';

/** The immutable record of one confirmed component (FR-19). */
export interface WeighingRecordView {
  recordId: string;
  sessionId: string;
  batchId: string;
  sequence: number;
  dyestuff: { code: string; name: string };
  /** As measured by the scale (its unit and resolution). */
  actual: Quantity;
  /** Snapshot of the recipe at confirmation, in the recipe's unit. */
  target: Quantity;
  toleranceLower: Quantity;
  toleranceUpper: Quantity;
  lotId: string;
  containerId: string;
  tare: Quantity;
  scaleId: string;
  operator: { operatorId: string; name: string };
  confirmedAt: string;
  result: RecordResult;
  /** Filled from bolt 012 on. */
  surplus: { amount: Quantity; percent: string } | null;
}

export interface ConfirmResponse {
  record: WeighingRecordView;
  session: SessionView;
}

export interface RecordListResponse {
  items: WeighingRecordView[];
}

export interface SessionComponentView {
  sequence: number;
  state: ComponentState;
  dyestuff: { code: string; name: string; shortName: string; colourHex: string; type: string };
  target: Quantity;
  tolerance: Quantity;
  barMax: Quantity;
  suggestedLotId: string | null;
  /** Scale, required capacity and preparation of the ACTIVE component; null for the others. */
  scale: ScaleAssignmentView | null;
  requirement: Quantity | null;
  preparation: PreparationView | null;
  /** Set once the component is DONE (the rail's "✓ actual"). */
  confirmed: {
    recordId: string;
    actual: Quantity;
    result: RecordResult;
    confirmedAt: string;
  } | null;
}

export interface SessionView {
  sessionId: string;
  batchId: string;
  stationId: string;
  status: SessionStatus;
  startedBy: { operatorId: string; name: string };
  startedAt: string;
  updatedAt: string;
  recipe: { recipeId: string; version: string; shade: string };
  componentCount: number;
  doneCount: number;
  activeSequence: number | null;
  components: SessionComponentView[];
  orgatexStatusSync: OrgatexStatusSync;
  completedAt: string | null;
}

export interface StartSessionRequest {
  batchId: string;
}

export interface CurrentSessionResponse {
  session: SessionView | null;
}

export type AuditEventType =
  'OVERRIDE' | 'SCALE_RESELECT' | 'ABANDON' | 'REPRINT' | 'WRITEBACK_RETRY';

export interface AuditEventView {
  eventId: string;
  sessionId: string | null;
  type: AuditEventType;
  actor: { operatorId: string; name: string };
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface AuditListResponse {
  items: AuditEventView[];
}

export interface ComponentCodeRequest {
  /** Scanned or typed dyestuff, lot or container code. */
  code: string;
}

export interface ReselectScaleRequest {
  scaleId: string;
  supervisorBadge: string;
  pin: string;
}

export interface ScaleOptionView {
  scaleId: string;
  capacity: Quantity;
  /** Capacity covers the component's requirement (inclusive). */
  fits: boolean;
  /** Connected and within its calibration date. */
  usable: boolean;
  state: 'READY' | 'OFFLINE' | 'CAL_EXPIRED';
  /** The scale the component currently uses. */
  selected: boolean;
}

export interface ScaleOptionsResponse {
  requirement: Quantity | null;
  items: ScaleOptionView[];
}
