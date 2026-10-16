/** Display formatting helpers (station-local time, quantities with the prototype's precision). */
import { formatValue, type Quantity } from '../../shared/quantity';

const pad = (n: number) => String(n).padStart(2, '0');

/** "06:12" from an ISO timestamp, in the station's local time. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "07:47:03" for the status-strip clock. */
export function hhmmss(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "94.0 g" / "24.000 kg" (g → 1 decimal, kg → 3 decimals). */
export function qty(q: Quantity): string {
  return `${formatValue(q)} ${q.unit}`;
}

/** "3 kg" for a scale capacity (no forced decimals). */
export function capacity(q: Quantity): string {
  return `${q.value} ${q.unit}`;
}
