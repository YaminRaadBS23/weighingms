/**
 * Dummy Scale HTTP API under /ext/scale — TRAINING CONTRACT ONLY (brief A-05 unresolved).
 * Only the WeighingMS scale adapter calls these endpoints; the station UI never does.
 */
import type { FastifyInstance } from 'fastify';
import { isUnit, type Quantity } from '../../../../shared/quantity';
import type { DummyScaleList, DummyTareRequest, DummyTareResult } from './contract';
import { deviceOr404 } from './devices';
import { ScaleDeviceError, type ScaleDevice } from './scale-device';
import { dummyScaleSimulationRoutes } from './simulation';

export interface DummyScaleOptions {
  devices: Map<string, ScaleDevice>;
  /** Registers the training-only `_sim` routes (never in production). */
  simulation: boolean;
}

const isQuantityBody = (q: unknown): q is Quantity =>
  typeof q === 'object' &&
  q !== null &&
  typeof (q as Quantity).value === 'string' &&
  /^\d+(\.\d+)?$/.test((q as Quantity).value) &&
  isUnit((q as Quantity).unit);

export async function dummyScaleRoutes(app: FastifyInstance, opts: DummyScaleOptions) {
  const { devices } = opts;

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ScaleDeviceError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    throw err;
  });

  app.addHook('onClose', async () => {
    for (const d of devices.values()) d.stopDispense();
  });

  app.get('/scales', async () => {
    const body: DummyScaleList = { items: [...devices.values()].map((d) => d.describe()) };
    return body;
  });

  app.get<{ Params: { scaleId: string } }>('/scales/:scaleId', async (req, reply) => {
    return deviceOr404(devices, req.params.scaleId, reply)?.describe();
  });

  app.get<{ Params: { scaleId: string } }>('/scales/:scaleId/reading', async (req, reply) => {
    return deviceOr404(devices, req.params.scaleId, reply)?.reading();
  });

  app.post<{ Params: { scaleId: string }; Body: DummyTareRequest | undefined }>(
    '/scales/:scaleId/tare',
    async (req, reply) => {
      const device = deviceOr404(devices, req.params.scaleId, reply);
      if (!device) return reply;
      const container = req.body?.containerWeight;
      if (container !== undefined && !isQuantityBody(container)) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'containerWeight must be { value, unit }' },
        });
      }
      const body: DummyTareResult = { tare: device.tare(container) };
      return body;
    },
  );

  if (opts.simulation) {
    await app.register(dummyScaleSimulationRoutes, { devices });
  }
}
