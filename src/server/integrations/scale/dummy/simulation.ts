/**
 * Training-only simulation controls for the Dummy Scale (`/ext/scale/_sim/...`).
 * Registered only when simulation is enabled (development/test), never in production.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { isUnit, toDecimal, type Quantity } from '../../../../shared/quantity';
import { deviceOr404 } from './devices';
import type { ScaleDevice } from './scale-device';

interface SimParams {
  Params: { scaleId: string };
}

/** Accepts `"93.4"` (scale's own unit) or `{ value, unit }`; replies 400 otherwise. */
function quantityArg(raw: unknown, reply: FastifyReply): Quantity | string | undefined {
  const ok =
    (typeof raw === 'string' && isDecimal(raw)) ||
    (typeof raw === 'object' &&
      raw !== null &&
      typeof (raw as Quantity).value === 'string' &&
      isUnit((raw as Quantity).unit) &&
      isDecimal((raw as Quantity).value));
  if (!ok) {
    void reply.code(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'Expected a decimal string or { value, unit }' },
    });
    return undefined;
  }
  return raw as Quantity | string;
}

function isDecimal(v: string): boolean {
  try {
    toDecimal(v);
    return true;
  } catch {
    return false;
  }
}

export async function dummyScaleSimulationRoutes(
  app: FastifyInstance,
  opts: { devices: Map<string, ScaleDevice> },
) {
  const { devices } = opts;
  const state = () => ({
    scales: [...devices.values()].map((d) => {
      const base = d.describe();
      // A disconnected scale has no reading.
      const reading = base.connected ? d.reading() : null;
      return { ...base, dispensing: d.isDispensing(), reading };
    }),
  });

  app.get('/_sim/state', async () => state());

  app.post('/_sim/reset', async () => {
    for (const d of devices.values()) d.reset();
    return state();
  });

  app.post<SimParams & { Body: { net?: unknown } }>('/_sim/:scaleId/weight', async (req, reply) => {
    const device = deviceOr404(devices, req.params.scaleId, reply);
    const net = device && quantityArg(req.body?.net, reply);
    if (!device || net === undefined) return reply;
    device.setNet(net);
    return state();
  });

  app.post<SimParams & { Body: { landing?: unknown } }>(
    '/_sim/:scaleId/dispense',
    async (req, reply) => {
      const device = deviceOr404(devices, req.params.scaleId, reply);
      const landing = device && quantityArg(req.body?.landing, reply);
      if (!device || landing === undefined) return reply;
      device.dispense(landing);
      return state();
    },
  );

  app.post<SimParams & { Body: { weight?: unknown } }>(
    '/_sim/:scaleId/container',
    async (req, reply) => {
      const device = deviceOr404(devices, req.params.scaleId, reply);
      const weight = device && quantityArg(req.body?.weight, reply);
      if (!device || weight === undefined) return reply;
      device.placeContainer(weight);
      return state();
    },
  );

  app.post<SimParams & { Body: { expired?: unknown } }>(
    '/_sim/:scaleId/calibration',
    async (req, reply) => {
      const device = deviceOr404(devices, req.params.scaleId, reply);
      if (!device) return reply;
      if (typeof req.body?.expired !== 'boolean') {
        return reply
          .code(400)
          .send({ error: { code: 'VALIDATION_ERROR', message: 'expired must be a boolean' } });
      }
      device.setCalibrationExpired(req.body.expired);
      return state();
    },
  );

  app.post<SimParams>('/_sim/:scaleId/disconnect', async (req, reply) => {
    const device = deviceOr404(devices, req.params.scaleId, reply);
    if (!device) return reply;
    device.disconnect();
    return state();
  });

  app.post<SimParams>('/_sim/:scaleId/reconnect', async (req, reply) => {
    const device = deviceOr404(devices, req.params.scaleId, reply);
    if (!device) return reply;
    device.reconnect();
    return state();
  });
}
