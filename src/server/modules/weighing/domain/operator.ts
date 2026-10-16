/** Operator entity: identified by badge; supervisors carry a hashed PIN. */
import type { OperatorRole } from '../../../../shared/weighing';

export interface Operator {
  operatorId: string;
  badgeId: string;
  name: string;
  shift: string;
  role: OperatorRole;
  active: boolean;
  /** scrypt hash of the supervisor PIN; null for operators. Never the PIN itself. */
  pinHash: string | null;
}

export function isSupervisor(op: Operator): boolean {
  return op.role === 'SUPERVISOR';
}
