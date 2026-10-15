/**
 * Dummy Scanner HTTP API under /ext/scanner — TRAINING CONTRACT ONLY (brief A-10).
 * The `_sim` routes exist only when simulation is enabled (development/test).
 */
import type { FastifyInstance } from 'fastify';
import type { DummyScannerStatus } from './contract';
import { ScannerDeviceError, type ScannerDevice } from './scanner-device';

export interface DummyScannerOptions {
  device: ScannerDevice;
  simulation: boolean;
}

export async function dummyScannerRoutes(app: FastifyInstance, opts: DummyScannerOptions) {
  const { device } = opts;

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ScannerDeviceError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    throw err;
  });

  app.get('/status', async () => {
    const body: DummyScannerStatus = { state: device.online ? 'READY' : 'OFFLINE' };
    return body;
  });

  app.get<{ Querystring: { since?: string } }>('/scans', async (req) => {
    const since = Number(req.query.since ?? 0);
    return device.feed(Number.isFinite(since) ? since : 0);
  });

  if (!opts.simulation) return;

  app.post<{ Body: { code?: unknown } }>('/_sim/scan', async (req, reply) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || !code.trim()) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'code must be a non-empty string' } });
    }
    return device.scan(code);
  });

  app.post('/_sim/offline', async () => {
    device.online = false;
    return { state: 'OFFLINE' };
  });

  app.post('/_sim/online', async () => {
    device.online = true;
    return { state: 'READY' };
  });

  app.post('/_sim/reset', async () => {
    device.reset();
    return { state: 'READY' };
  });
}
