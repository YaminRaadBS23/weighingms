/**
 * Which batches the station may weigh (brief FR-3, FR-4, BR-03). Pure; shared by server and UI.
 * RELEASED batches can be started; WEIGHING batches can be resumed.
 */
export type BatchStatus = 'QUEUED' | 'RELEASED' | 'WEIGHING' | 'WEIGHED';

export const SELECTION_REASONS = {
  NOT_RELEASED: 'Not released by OrgaTEX',
  ALREADY_WEIGHED: 'Already weighed',
  NO_RECIPE: 'No recipe available',
} as const;

export interface Selectability {
  selectable: boolean;
  /** Why the batch cannot be selected; null when it can. */
  reason: string | null;
}

export function batchSelectability(status: BatchStatus, hasRecipe: boolean): Selectability {
  if (status === 'QUEUED') return { selectable: false, reason: SELECTION_REASONS.NOT_RELEASED };
  if (status === 'WEIGHED') return { selectable: false, reason: SELECTION_REASONS.ALREADY_WEIGHED };
  if (!hasRecipe) return { selectable: false, reason: SELECTION_REASONS.NO_RECIPE };
  return { selectable: true, reason: null };
}
