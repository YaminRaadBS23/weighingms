/**
 * Pure view-model of the Weigh screen: what the live reading means for the operator. Zones come
 * from the shared tolerance rules, so the screen cannot disagree with the server (TD-5).
 */
import {
  evaluateZone,
  isOverridable,
  surplus,
  toleranceBand,
  type ToleranceZone,
} from '../../../shared/domain/tolerance';
import { convert, formatValue, subtract, toDecimal, type Quantity } from '../../../shared/quantity';
import type { ScaleDisplayState } from '../../../shared/scales';
import type { SessionComponentView } from '../../../shared/weighing';
import { hasMessage, t, type MessageKey } from '../../i18n/messages';
import { ApiError } from '../../services/api-client';

type Spec = Pick<SessionComponentView, 'target' | 'tolerance'>;

/** Zone of a reading; no reading counts as under (nothing on the scale yet). */
export function zoneOf(weight: Quantity | null, spec: Spec): ToleranceZone {
  return weight ? evaluateZone(weight, spec) : 'UNDER';
}

/** The reading in the component's unit ("94.0"); "—" while there is none. */
export function shownWeight(weight: Quantity | null, spec: Spec): string {
  return weight ? formatValue(convert(weight, spec.target.unit)) : '—';
}

/** Still to weigh: target − weight, never below zero. */
export function remaining(weight: Quantity | null, spec: Spec): Quantity {
  if (!weight) return spec.target;
  const left = subtract(spec.target, convert(weight, spec.target.unit));
  return toDecimal(left.value).isNegative() ? { value: '0', unit: spec.target.unit } : left;
}

/** Prototype status line: DISPENSE / WITHIN TOLERANCE / OVER TOLERANCE. */
export function statusText(weight: Quantity | null, spec: Spec): string {
  const zone = zoneOf(weight, spec);
  if (zone === 'OVER' && weight) {
    const over = subtract(convert(weight, spec.target.unit), spec.target);
    return t('weigh.status.over', { amount: formatValue(over), unit: spec.target.unit });
  }
  if (zone === 'OK') return t('weigh.status.ok');
  const left = remaining(weight, spec);
  return t('weigh.status.dispense', { amount: formatValue(left), unit: left.unit });
}

export interface BarGeometry {
  /** Percentages of the bar's full length (the recipe's bar maximum). */
  fill: number;
  bandLeft: number;
  bandWidth: number;
  targetLeft: number;
}

const pct = (part: string, whole: string): number =>
  Math.min(100, Math.max(0, toDecimal(part).dividedBy(toDecimal(whole)).times(100).toNumber()));

export function barGeometry(
  weight: Quantity | null,
  spec: Spec & { barMax: Quantity },
): BarGeometry {
  const max = convert(spec.barMax, spec.target.unit).value;
  const { lower, upper } = toleranceBand(spec);
  const w = weight ? convert(weight, spec.target.unit).value : '0';
  const bandLeft = pct(lower.value, max);
  return {
    fill: pct(w, max),
    bandLeft,
    bandWidth: pct(upper.value, max) - bandLeft,
    targetLeft: pct(spec.target.value, max),
  };
}

/** "TOLERANCE ±0.5 g  (93.5 – 94.5)" */
export function bandCaption(spec: Spec): string {
  const { lower, upper } = toleranceBand(spec);
  return t('weigh.bandCaption', {
    tol: formatValue(spec.tolerance),
    unit: spec.target.unit,
    lower: formatValue(lower),
    upper: formatValue(upper),
  });
}

/** No successful reading for this long counts as a lost scale (Step 24 failure handling). */
export const SCALE_LOST_MS = 2000;

export type ScaleCondition = 'OK' | 'LOST' | 'RECONNECTED' | 'CAL_EXPIRED';

export interface ScaleConditionInput {
  /** Slow-polled state of the assigned scale; null until known. */
  scaleState: ScaleDisplayState | null;
  /** Milliseconds since the last successful reading while unlocked; 0 when readings arrive. */
  msWithoutReading: number;
  /** The scale came back after a loss and has not been re-tared since. */
  retareNeeded: boolean;
}

/**
 * What the operator must be told about the scale: expired calibration blocks weighing, a lost
 * scale stops it, and a scale that came back must be re-tared before anything is confirmed.
 */
export function scaleCondition(i: ScaleConditionInput): ScaleCondition {
  if (i.scaleState === 'CAL_EXPIRED') return 'CAL_EXPIRED';
  if (i.scaleState === 'OFFLINE' || i.msWithoutReading >= SCALE_LOST_MS) return 'LOST';
  if (i.retareNeeded) return 'RECONNECTED';
  return 'OK';
}

export interface OkKeyInput {
  unlocked: boolean;
  /** null: no reading yet. */
  stable: boolean | null;
  scaleReady: boolean;
  zone: ToleranceZone;
  condition?: ScaleCondition;
}

/** OK is enabled only for an unlocked component, a ready scale and a stable reading in tolerance. */
export function okKeyState(i: OkKeyInput): { enabled: boolean; reason: MessageKey | null } {
  if (!i.unlocked) return { enabled: false, reason: 'weigh.ok.locked' };
  if (i.condition === 'CAL_EXPIRED') return { enabled: false, reason: 'weigh.ok.expired' };
  if (i.condition === 'LOST') return { enabled: false, reason: 'weigh.ok.lost' };
  if (i.condition === 'RECONNECTED') return { enabled: false, reason: 'weigh.ok.retare' };
  if (!i.scaleReady) return { enabled: false, reason: 'weigh.ok.scale' };
  if (i.stable === null) return { enabled: false, reason: 'weigh.ok.noReading' };
  if (!i.stable) return { enabled: false, reason: 'weigh.ok.unstable' };
  if (i.zone !== 'OK') return { enabled: false, reason: 'weigh.ok.zone' };
  return { enabled: true, reason: null };
}

export interface OverrideKeyInput {
  unlocked: boolean;
  weight: Quantity | null;
  condition: ScaleCondition;
}

/**
 * The supervisor override key is offered for any unlocked weight above zero that is outside the
 * band (Step 24). The server decides again with its own reading.
 */
export function overrideKeyState(
  i: OverrideKeyInput,
  spec: Spec,
): { enabled: boolean; reason: MessageKey | null } {
  if (!i.unlocked || i.condition !== 'OK')
    return { enabled: false, reason: 'weigh.override.locked' };
  if (!i.weight || !toDecimal(i.weight.value).greaterThan(0))
    return { enabled: false, reason: 'weigh.override.noWeight' };
  if (!isOverridable(evaluateZone(i.weight, spec), i.weight))
    return { enabled: false, reason: 'weigh.override.inTolerance' };
  return { enabled: true, reason: null };
}

export interface SurplusView {
  amount: string;
  unit: string;
  percent: string;
}

/** Surplus measured from the target, shown whenever the live reading is over tolerance. */
export function surplusView(weight: Quantity | null, spec: Spec): SurplusView | null {
  if (!weight || zoneOf(weight, spec) !== 'OVER') return null;
  const s = surplus(weight, spec);
  return { amount: formatValue(s.amount), unit: s.amount.unit, percent: s.percent };
}

/** Operator-facing wording of an API failure; unknown codes fall back to the server's message. */
export function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return t('error.network');
  const key = `weigh.err.${err.code}`;
  return hasMessage(key) ? t(key) : err.message;
}
