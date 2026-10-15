/**
 * WeighingMS `/api/scanner` and `/api/printer` facade for the station UI.
 * Scanned and typed codes are normalised and classified by the same function.
 */
import type { FastifyInstance } from 'fastify';
import { ErrorCode } from '../../../shared/errors';
import type {
  ManualCodeRequest,
  PrinterStatusResponse,
  ScanEvent,
  ScanFeedResponse,
  ScannerStatusResponse,
} from '../../../shared/peripherals';
import { classifyCode, normaliseCode } from '../../../shared/scan-codes';
import { DomainError } from '../../errors';
import type { PrinterPort } from '../../integrations/printer/printer-port';
import type { ScannerPort } from '../../integrations/scanner/scanner-port';

export interface PeripheralRoutesOptions {
  scanner: ScannerPort;
  printer: PrinterPort;
  now?: () => Date;
}

export async function peripheralRoutes(app: FastifyInstance, opts: PeripheralRoutesOptions) {
  const { scanner, printer } = opts;
  const now = opts.now ?? (() => new Date());

  app.get('/scanner/status', async () => {
    let state: ScannerStatusResponse['state'];
    try {
      state = await scanner.getStatus();
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      state = 'OFFLINE';
    }
    const body: ScannerStatusResponse = { state };
    return body;
  });

  app.get<{ Querystring: { since?: string } }>('/scanner/scans', async (req) => {
    const since = Number(req.query.since ?? 0);
    const feed = await scanner.scansSince(Number.isInteger(since) && since >= 0 ? since : 0);
    const body: ScanFeedResponse = {
      items: feed.scans.map((s): ScanEvent => ({
        seq: s.seq,
        code: normaliseCode(s.code),
        kind: classifyCode(s.code),
        source: 'SCANNER',
        at: s.at,
      })),
      cursor: feed.cursor,
    };
    return body;
  });

  /** Typed entry — always available, even when the scanner is offline (FR-34). */
  app.post<{ Body: ManualCodeRequest }>('/scanner/manual', async (req, reply) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || !normaliseCode(code)) {
      return reply.code(400).send({
        error: { code: ErrorCode.VALIDATION_ERROR, message: 'code must be a non-empty string' },
      });
    }
    const body: ScanEvent = {
      seq: null,
      code: normaliseCode(code),
      kind: classifyCode(code),
      source: 'MANUAL',
      at: now().toISOString(),
    };
    return body;
  });

  /** Always answers: an unreachable printer is reported as OFFLINE for the status bar. */
  app.get('/printer/status', async () => {
    let state: PrinterStatusResponse['state'];
    try {
      state = await printer.getStatus();
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      state = 'OFFLINE';
    }
    const body: PrinterStatusResponse = { state };
    return body;
  });
}
