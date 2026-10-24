/**
 * HTTP adapter implementing ScalePort against the Dummy Scale training contract (/ext/scale).
 * A real indicator driver (serial/Ethernet, brief A-05) would be another adapter for the same port.
 */
import type { Quantity } from '../../../shared/quantity';
import {
  DomainError,
  ScaleNotFoundError,
  ScaleProtocolError,
  ScaleUnavailableError,
} from '../../errors';
import {
  errorOf,
  requestWithTimeout,
  type AdapterLogger,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from '../http';
import type { DummyReading, DummyScale, DummyScaleList, DummyTareResult } from './dummy/contract';
import type { ScaleInfo, ScalePort, ScaleReading, TareOptions } from './scale-port';

export interface HttpScaleAdapterOptions {
  client: HttpClient;
  timeoutMs: number;
  logger: AdapterLogger;
}

const isScale = (s: DummyScale) => typeof s?.scaleId === 'string' && typeof s.unit === 'string';
const isQuantity = (q: Quantity | undefined) =>
  typeof q?.value === 'string' && typeof q.unit === 'string';

function mapScale(s: DummyScale): ScaleInfo {
  return {
    scaleId: s.scaleId,
    class: s.class,
    capacity: s.capacity,
    unit: s.unit,
    resolution: s.resolution,
    calibrationDueAt: s.calibrationDueAt,
    connected: s.connected,
  };
}

const enc = encodeURIComponent;

export class HttpScaleAdapter implements ScalePort {
  constructor(private readonly opts: HttpScaleAdapterOptions) {}

  async listScales(): Promise<ScaleInfo[]> {
    const body = (await this.call('listScales', '', { method: 'GET', path: '/scales' })) as
      DummyScaleList | undefined;
    if (!Array.isArray(body?.items) || !body.items.every(isScale)) {
      throw new ScaleProtocolError('*', 'malformed scale list');
    }
    return body.items.map(mapScale);
  }

  async getScale(scaleId: string): Promise<ScaleInfo> {
    const body = (await this.call('getScale', scaleId, {
      method: 'GET',
      path: `/scales/${enc(scaleId)}`,
    })) as DummyScale;
    if (!isScale(body)) throw new ScaleProtocolError(scaleId, 'malformed scale');
    return mapScale(body);
  }

  async read(scaleId: string): Promise<ScaleReading> {
    const body = (await this.call('read', scaleId, {
      method: 'GET',
      path: `/scales/${enc(scaleId)}/reading`,
    })) as DummyReading;
    if (!isQuantity(body?.net) || typeof body.stable !== 'boolean') {
      throw new ScaleProtocolError(scaleId, 'malformed reading');
    }
    return { net: body.net, stable: body.stable, at: body.at };
  }

  async tare(scaleId: string, options: TareOptions = {}): Promise<Quantity> {
    const body = (await this.call('tare', scaleId, {
      method: 'POST',
      path: `/scales/${enc(scaleId)}/tare`,
      ...(options.containerTare ? { body: { containerWeight: options.containerTare } } : {}),
    })) as DummyTareResult;
    if (!isQuantity(body?.tare)) throw new ScaleProtocolError(scaleId, 'malformed tare result');
    return body.tare;
  }

  /** One request with timeout and error translation. Successful reads log at debug (10 Hz). */
  private async call(operation: string, scaleId: string, req: HttpRequest): Promise<unknown> {
    const started = Date.now();
    const log = (outcome: string, extra: object = {}) => ({
      system: 'scale',
      operation,
      scaleId,
      outcome,
      durationMs: Date.now() - started,
      ...extra,
    });

    let res: HttpResponse;
    try {
      res = await requestWithTimeout(
        this.opts.client,
        req,
        this.opts.timeoutMs,
        () => new ScaleUnavailableError(scaleId, `timeout after ${this.opts.timeoutMs} ms`),
      );
    } catch (err) {
      const failure =
        err instanceof DomainError
          ? err
          : new ScaleUnavailableError(scaleId, (err as Error).message);
      this.opts.logger.warn(
        log('unavailable', { reason: failure.details?.reason }),
        'Scale call failed',
      );
      throw failure;
    }

    if (res.status === 200) {
      this.opts.logger.debug?.(log('ok'), 'Scale call');
      return res.body;
    }
    const { code } = errorOf(res.body);
    if (res.status === 404 && code === 'SCALE_NOT_FOUND') {
      this.opts.logger.info(log('not-found'), 'Scale call');
      throw new ScaleNotFoundError(scaleId);
    }
    if (res.status === 503 || res.status >= 500) {
      this.opts.logger.warn(log('unavailable', { status: res.status, code }), 'Scale call failed');
      throw new ScaleUnavailableError(scaleId, code ?? `status ${res.status}`);
    }
    this.opts.logger.warn(log('protocol-error', { status: res.status, code }), 'Scale call failed');
    throw new ScaleProtocolError(scaleId, `unexpected status ${res.status}`);
  }
}
