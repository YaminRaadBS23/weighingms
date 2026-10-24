/**
 * Wire format of the Dummy Scale HTTP API (`/ext/scale/...`).
 * TRAINING CONTRACT ONLY — a request/response stand-in for scale indicators whose real
 * protocol is unknown (brief A-05). WeighingMS code never imports these types.
 */
import type { Quantity, Unit } from '../../../../shared/quantity';

export type DummyScaleClass = 'PRECISION' | 'FLOOR';

export interface DummyScale {
  scaleId: string;
  class: DummyScaleClass;
  capacity: Quantity;
  /** Unit the indicator reads in. */
  unit: Unit;
  resolution: Quantity;
  calibrationDueAt: string;
  connected: boolean;
}

export interface DummyScaleList {
  items: DummyScale[];
}

export interface DummyReading {
  gross: Quantity;
  tare: Quantity;
  net: Quantity;
  /** True once the weight has not changed for at least 500 ms. */
  stable: boolean;
  at: string;
}

/**
 * Optional body of POST /scales/:scaleId/tare. Training behaviour (ADR-4): the Dummy Scale first
 * places a fresh container of this weight, then tares — unless the trainer put a container on
 * (`_sim/container`) since the last tare, which is kept as it is.
 */
export interface DummyTareRequest {
  containerWeight?: Quantity;
}

export interface DummyTareResult {
  tare: Quantity;
}
