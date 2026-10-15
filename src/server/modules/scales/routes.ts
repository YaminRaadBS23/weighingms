/**
 * WeighingMS `/api/scales` facade — the station UI's only access to the scales.
 * Delegates to ScalePort; adds calibration and display state.
 */
import type { FastifyInstance } from 'fastify';
import type {
  CalibrationState,
  ScaleDisplayState,
  ScaleListResponse,
  ScaleStatusResponse,
  ScaleSummary,
  TareResponse,
  WeightResponse,
} from '../../../shared/scales';
import type { ScaleInfo, ScalePort } from '../../integrations/scale/scale-port';

export interface ScaleRoutesOptions {
  scales: ScalePort;
  now?: () => Date;
}

export function calibrationState(info: ScaleInfo, now: Date): CalibrationState {
  return Date.parse(info.calibrationDueAt) < now.getTime() ? 'EXPIRED' : 'VALID';
}

export function displayState(info: ScaleInfo, now: Date): ScaleDisplayState {
  if (!info.connected) return 'OFFLINE';
  return calibrationState(info, now) === 'EXPIRED' ? 'CAL_EXPIRED' : 'READY';
}

function summary(info: ScaleInfo, now: Date): ScaleSummary {
  return {
    scaleId: info.scaleId,
    class: info.class,
    capacity: info.capacity,
    unit: info.unit,
    resolution: info.resolution,
    calibrationDueAt: info.calibrationDueAt,
    calibration: calibrationState(info, now),
    state: displayState(info, now),
  };
}

export async function scaleRoutes(app: FastifyInstance, opts: ScaleRoutesOptions) {
  const { scales } = opts;
  const now = opts.now ?? (() => new Date());

  app.get('/scales', async () => {
    const at = now();
    const body: ScaleListResponse = {
      items: (await scales.listScales()).map((s) => summary(s, at)),
    };
    return body;
  });

  app.get<{ Params: { scaleId: string } }>('/scales/:scaleId/status', async (req) => {
    const info = await scales.getScale(req.params.scaleId);
    const at = now();
    const body: ScaleStatusResponse = {
      scaleId: info.scaleId,
      connected: info.connected,
      calibration: calibrationState(info, at),
      state: displayState(info, at),
    };
    return body;
  });

  app.get<{ Params: { scaleId: string } }>('/scales/:scaleId/weight', async (req) => {
    const reading = await scales.read(req.params.scaleId);
    const body: WeightResponse = {
      weight: reading.net,
      stable: reading.stable,
      connected: true,
      at: reading.at,
    };
    return body;
  });

  app.post<{ Params: { scaleId: string } }>('/scales/:scaleId/tare', async (req) => {
    const body: TareResponse = { tare: await scales.tare(req.params.scaleId) };
    return body;
  });
}
