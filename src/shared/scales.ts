/** Contract types of the WeighingMS `/api/scales` API, shared by server and station UI. */
import type { Quantity, Unit } from './quantity';

export type CalibrationState = 'VALID' | 'EXPIRED';

/** What the status bar shows: "SCALE 3 kg · READY" / OFFLINE / CAL EXPIRED. */
export type ScaleDisplayState = 'READY' | 'OFFLINE' | 'CAL_EXPIRED';

export interface ScaleSummary {
  scaleId: string;
  class: 'PRECISION' | 'FLOOR';
  capacity: Quantity;
  unit: Unit;
  resolution: Quantity;
  calibrationDueAt: string;
  calibration: CalibrationState;
  state: ScaleDisplayState;
}

export interface ScaleListResponse {
  items: ScaleSummary[];
}

export interface ScaleStatusResponse {
  scaleId: string;
  connected: boolean;
  calibration: CalibrationState;
  state: ScaleDisplayState;
}

/** Response of GET /api/scales/:scaleId/weight, polled at 10 Hz by the Weigh screen. */
export interface WeightResponse {
  weight: Quantity;
  stable: boolean;
  connected: true;
  at: string;
}

export interface TareResponse {
  tare: Quantity;
}
