/**
 * Dummy Printer HTTP API under /ext/printer — TRAINING CONTRACT ONLY (brief A-04, Q18).
 * The `_sim` routes exist only when simulation is enabled (development/test).
 */
import type { FastifyInstance } from 'fastify';
import type { DummyPrinterState, DummyPrinterStatus, DummyPrintJobList } from './contract';
import { PRINTER_STATES, PrinterDeviceError, type PrinterDevice } from './printer-device';

export interface DummyPrinterOptions {
  device: PrinterDevice;
  simulation: boolean;
}

function isPrintRequest(
  b: unknown,
): b is { documentId: string; lines: string[]; barcode: string | null } {
  const r = b as { documentId?: unknown; lines?: unknown; barcode?: unknown } | null;
  return (
    !!r &&
    typeof r.documentId === 'string' &&
    !!r.documentId &&
    Array.isArray(r.lines) &&
    r.lines.every((l) => typeof l === 'string') &&
    (r.barcode === null || r.barcode === undefined || typeof r.barcode === 'string')
  );
}

export async function dummyPrinterRoutes(app: FastifyInstance, opts: DummyPrinterOptions) {
  const { device } = opts;

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PrinterDeviceError) {
      return reply.code(err.status).send({
        error: {
          code: err.code,
          message: err.message,
          ...(err.state ? { details: { state: err.state } } : {}),
        },
      });
    }
    throw err;
  });

  app.get('/status', async () => {
    const body: DummyPrinterStatus = { state: device.state };
    return body;
  });

  app.post('/jobs', async (req, reply) => {
    if (!isPrintRequest(req.body)) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Expected { documentId, lines[], barcode }' },
      });
    }
    return device.print({ ...req.body, barcode: req.body.barcode ?? null });
  });

  app.get('/jobs', async () => {
    const body: DummyPrintJobList = { items: device.listJobs() };
    return body;
  });

  if (!opts.simulation) return;

  app.post<{ Body: { state?: unknown } }>('/_sim/state', async (req, reply) => {
    const state = req.body?.state;
    if (!PRINTER_STATES.includes(state as DummyPrinterState)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'state must be READY, OFFLINE or OUT_OF_PAPER',
        },
      });
    }
    device.state = state as DummyPrinterState;
    return { state: device.state };
  });

  app.post('/_sim/reset', async () => {
    device.reset();
    return { state: device.state };
  });
}
