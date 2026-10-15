/** HTTP adapter implementing ScannerPort against the Dummy Scanner training contract (/ext/scanner). */
import { DeviceProtocolError, DomainError, ScannerUnavailableError } from '../../errors';
import {
  errorOf,
  requestWithTimeout,
  type AdapterLogger,
  type HttpClient,
  type HttpRequest,
} from '../http';
import type { DummyScanFeed, DummyScannerStatus } from './dummy/contract';
import type { RawScan, ScannerPort } from './scanner-port';

export interface HttpScannerAdapterOptions {
  client: HttpClient;
  timeoutMs: number;
  logger: AdapterLogger;
}

export class HttpScannerAdapter implements ScannerPort {
  constructor(private readonly opts: HttpScannerAdapterOptions) {}

  async getStatus(): Promise<'READY' | 'OFFLINE'> {
    const body = (await this.call('getStatus', { method: 'GET', path: '/status' })) as
      DummyScannerStatus | undefined;
    if (body?.state !== 'READY' && body?.state !== 'OFFLINE') {
      throw new DeviceProtocolError('scanner', 'malformed status');
    }
    return body.state;
  }

  async scansSince(since: number): Promise<{ scans: RawScan[]; cursor: number }> {
    const body = (await this.call('scansSince', {
      method: 'GET',
      path: `/scans?since=${since}`,
    })) as DummyScanFeed | undefined;
    if (!Array.isArray(body?.items) || typeof body.cursor !== 'number') {
      throw new DeviceProtocolError('scanner', 'malformed scan feed');
    }
    return { scans: body.items.map((s) => ({ ...s })), cursor: body.cursor };
  }

  /** One request with timeout and error translation; successes logged at debug (polled). */
  private async call(operation: string, req: HttpRequest): Promise<unknown> {
    const log = (outcome: string, extra: object = {}) => ({
      system: 'scanner',
      operation,
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
        () => new ScannerUnavailableError(`timeout after ${this.opts.timeoutMs} ms`),
      ));
    } catch (err) {
      const failure =
        err instanceof DomainError ? err : new ScannerUnavailableError((err as Error).message);
      this.opts.logger.warn(log('unavailable'), 'Scanner call failed');
      throw failure;
    }
    if (status === 200) {
      this.opts.logger.debug?.(log('ok'), 'Scanner call');
      return body;
    }
    const { code } = errorOf(body);
    this.opts.logger.warn(log('unavailable', { status, code }), 'Scanner call failed');
    if (status >= 500) throw new ScannerUnavailableError(code ?? `status ${status}`);
    throw new DeviceProtocolError('scanner', `unexpected status ${status}`);
  }
}
