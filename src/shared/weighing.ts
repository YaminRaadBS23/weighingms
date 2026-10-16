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

export interface SessionComponentView {
  sequence: number;
  state: ComponentState;
  dyestuff: { code: string; name: string; shortName: string; colourHex: string; type: string };
  target: Quantity;
  tolerance: Quantity;
  barMax: Quantity;
  suggestedLotId: string | null;
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
