/** HTTP adapter implementing PrinterPort against the Dummy Printer training contract (/ext/printer). */
import { DeviceProtocolError, DomainError, PrinterUnavailableError } from '../../errors';
import { requestWithTimeout, type AdapterLogger, type HttpClient, type HttpRequest } from '../http';
import type { DummyPrinterStatus, DummyPrintJob, DummyPrintJobList } from './dummy/contract';
import type { PrintDocument, PrinterPort, PrinterStateValue, PrintResult } from './printer-port';

export interface HttpPrinterAdapterOptions {
  client: HttpClient;
  timeoutMs: number;
  logger: AdapterLogger;
}

const STATES: PrinterStateValue[] = ['READY', 'OFFLINE', 'OUT_OF_PAPER'];

function mapJob(j: DummyPrintJob): PrintResult {
  return { jobId: j.jobId, documentId: j.documentId, printedAt: j.printedAt, preview: j.preview };
}

function stateOf(body: unknown): 'OFFLINE' | 'OUT_OF_PAPER' {
  const state = (body as { error?: { details?: { state?: unknown } } } | null)?.error?.details
    ?.state;
  return state === 'OUT_OF_PAPER' ? 'OUT_OF_PAPER' : 'OFFLINE';
}

export class HttpPrinterAdapter implements PrinterPort {
  constructor(private readonly opts: HttpPrinterAdapterOptions) {}

  async getStatus(): Promise<PrinterStateValue> {
    const body = (await this.call('getStatus', { method: 'GET', path: '/status' })) as
      DummyPrinterStatus | undefined;
    if (!body || !STATES.includes(body.state)) {
      throw new DeviceProtocolError('printer', 'malformed status');
    }
    return body.state;
  }

  async print(doc: PrintDocument): Promise<PrintResult> {
    const body = (await this.call(
      'print',
      { method: 'POST', path: '/jobs', body: doc },
      { documentId: doc.documentId },
    )) as DummyPrintJob | undefined;
    if (typeof body?.jobId !== 'string') throw new DeviceProtocolError('printer', 'malformed job');
    return mapJob(body);
  }

  async listJobs(): Promise<PrintResult[]> {
    const body = (await this.call('listJobs', { method: 'GET', path: '/jobs' })) as
      DummyPrintJobList | undefined;
    if (!Array.isArray(body?.items)) throw new DeviceProtocolError('printer', 'malformed job list');
    return body.items.map(mapJob);
  }

  /** One request with timeout and error translation (brief IR-09 logging). */
  private async call(
    operation: string,
    req: HttpRequest,
    ids: Record<string, string> = {},
  ): Promise<unknown> {
    const log = (outcome: string, extra: object = {}) => ({
      system: 'printer',
      operation,
      ...ids,
      outcome,
      ...extra,
    });
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await requestWithTimeout(
        this.opts.client,
        req,
        this.opts.timeoutMs,
        () => new PrinterUnavailableError('OFFLINE', `timeout after ${this.opts.timeoutMs} ms`),
      ));
    } catch (err) {
      const failure =
        err instanceof DomainError
          ? err
          : new PrinterUnavailableError('OFFLINE', (err as Error).message);
      this.opts.logger.warn(log('unavailable'), 'Printer call failed');
      throw failure;
    }
    if (status === 200) {
      // Printing is a business event (info); status polling is noise (debug).
      if (operation === 'print') this.opts.logger.info(log('ok'), 'Printer call');
      else this.opts.logger.debug?.(log('ok'), 'Printer call');
      return body;
    }
    if (status >= 500) {
      const state = stateOf(body);
      this.opts.logger.warn(log('unavailable', { status, state }), 'Printer call failed');
      throw new PrinterUnavailableError(state, `status ${status}`);
    }
    this.opts.logger.warn(log('protocol-error', { status }), 'Printer call failed');
    throw new DeviceProtocolError('printer', `unexpected status ${status}`);
  }
}
