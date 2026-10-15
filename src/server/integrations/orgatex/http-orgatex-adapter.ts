/**
 * HTTP adapter implementing OrgatexPort against the Dummy OrgaTEX training contract (/ext/orgatex).
 * Replacing the dummy with the real OrgaTEX means writing another adapter for the same port.
 */
import {
  BatchNotFoundError,
  DomainError,
  DyestuffNotFoundError,
  OrgatexProtocolError,
  OrgatexUnavailableError,
  RecipeNotFoundError,
} from '../../errors';
import type { DummyBatch, DummyBatchList, DummyLotList, DummyRecipe } from './dummy/contract';
import type {
  OrgatexBatch,
  OrgatexBatchQueue,
  OrgatexLinkStatus,
  OrgatexLot,
  OrgatexPort,
  OrgatexRecipe,
} from './orgatex-port';

export interface HttpResponse {
  status: number;
  body: unknown;
}

/** Minimal transport so tests can use Fastify inject instead of a network socket. */
export interface HttpClient {
  get(path: string, signal: AbortSignal): Promise<HttpResponse>;
}

export interface AdapterLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface HttpOrgatexAdapterOptions {
  client: HttpClient;
  timeoutMs: number;
  logger: AdapterLogger;
  now?: () => Date;
}

/** Transport over the global fetch API. */
export function fetchHttpClient(baseUrl: string): HttpClient {
  const base = baseUrl.replace(/\/$/, '');
  return {
    async get(path, signal) {
      const res = await fetch(`${base}${path}`, {
        signal,
        headers: { accept: 'application/json' },
      });
      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      return { status: res.status, body };
    },
  };
}

function errorCodeOf(body: unknown): string | undefined {
  const err = (body as { error?: { code?: unknown } } | null)?.error;
  return typeof err?.code === 'string' ? err.code : undefined;
}

function requireObject<T>(body: unknown, check: (b: T) => boolean, what: string): T {
  if (typeof body !== 'object' || body === null || !check(body as T)) {
    throw new OrgatexProtocolError(`malformed ${what}`);
  }
  return body as T;
}

function mapBatch(b: DummyBatch): OrgatexBatch {
  return {
    batchId: b.batchId,
    orderRef: b.orderRef,
    machineRef: b.machineRef,
    fabricDesc: b.fabricDesc,
    fabricWeight: b.fabricWeight,
    shade: b.shade,
    componentCount: b.componentCount,
    status: b.status,
    hasRecipe: b.recipeId !== null,
    releasedAt: b.releasedAt,
  };
}

const isBatch = (b: DummyBatch) => typeof b.batchId === 'string' && typeof b.status === 'string';

export class HttpOrgatexAdapter implements OrgatexPort {
  private link: OrgatexLinkStatus = { state: 'UNKNOWN', lastContactAt: null };
  private readonly now: () => Date;

  constructor(private readonly opts: HttpOrgatexAdapterOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  getLinkStatus(): OrgatexLinkStatus {
    return { ...this.link };
  }

  async listBatches(stationId: string): Promise<OrgatexBatchQueue> {
    const body = await this.call(
      'listBatches',
      `/stations/${encodeURIComponent(stationId)}/batches`,
      {},
    );
    const list = requireObject<DummyBatchList>(
      body,
      (b) => Array.isArray(b.items) && b.items.every(isBatch),
      'batch list',
    );
    return { batches: list.items.map(mapBatch), receivedAt: this.now().toISOString() };
  }

  async getBatch(batchId: string): Promise<OrgatexBatch> {
    const body = await this.call('getBatch', `/batches/${encodeURIComponent(batchId)}`, {
      batchId,
    });
    return mapBatch(requireObject<DummyBatch>(body, isBatch, 'batch'));
  }

  async getRecipe(batchId: string): Promise<OrgatexRecipe> {
    const body = await this.call('getRecipe', `/batches/${encodeURIComponent(batchId)}/recipe`, {
      batchId,
    });
    const r = requireObject<DummyRecipe>(
      body,
      (b) => typeof b.recipeId === 'string' && Array.isArray(b.components),
      'recipe',
    );
    return {
      recipeId: r.recipeId,
      batchId: r.batchId,
      shade: r.shade,
      version: r.version,
      components: r.components.map((c) => ({
        sequence: c.sequence,
        dyestuff: { ...c.dyestuff },
        target: c.target,
        tolerance: c.tolerance,
        barMax: c.barMax,
        suggestedLotId: c.suggestedLot,
      })),
    };
  }

  async listLots(dyestuffCode: string): Promise<OrgatexLot[]> {
    const body = await this.call(
      'listLots',
      `/dyestuffs/${encodeURIComponent(dyestuffCode)}/lots`,
      {
        dyestuffCode,
      },
    );
    const list = requireObject<DummyLotList>(body, (b) => Array.isArray(b.items), 'lot list');
    return list.items.map((l) => ({ lotId: l.lotId, dyestuffCode: l.dyestuffCode }));
  }

  /** Performs one GET with timeout, translates failures, logs the outcome (brief IR-09). */
  private async call(
    operation: string,
    path: string,
    ids: Record<string, string>,
  ): Promise<unknown> {
    const started = Date.now();
    const log = (outcome: string, extra: object = {}) => ({
      system: 'orgatex',
      operation,
      ...ids,
      outcome,
      durationMs: Date.now() - started,
      ...extra,
    });

    let res: HttpResponse;
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new OrgatexUnavailableError(`timeout after ${this.opts.timeoutMs} ms`));
        }, this.opts.timeoutMs);
      });
      res = await Promise.race([this.opts.client.get(path, controller.signal), timeout]);
    } catch (err) {
      const failure =
        err instanceof DomainError ? err : new OrgatexUnavailableError((err as Error).message);
      this.markOffline();
      this.opts.logger.warn(
        log('unavailable', { reason: failure.details?.reason }),
        'OrgaTEX call failed',
      );
      throw failure;
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 500) {
      this.markOffline();
      this.opts.logger.warn(log('unavailable', { status: res.status }), 'OrgaTEX call failed');
      throw new OrgatexUnavailableError(`OrgaTEX responded ${res.status}`);
    }

    this.markOnline();
    if (res.status === 404) {
      const code = errorCodeOf(res.body);
      this.opts.logger.info(log('not-found', { code }), 'OrgaTEX call');
      if (code === 'RECIPE_NOT_FOUND') throw new RecipeNotFoundError(ids.batchId ?? '');
      if (code === 'DYESTUFF_NOT_FOUND') throw new DyestuffNotFoundError(ids.dyestuffCode ?? '');
      if (code === 'BATCH_NOT_FOUND') throw new BatchNotFoundError(ids.batchId ?? '');
      throw new OrgatexProtocolError(`unexpected 404 for ${operation}`);
    }
    if (res.status !== 200) {
      this.opts.logger.warn(log('protocol-error', { status: res.status }), 'OrgaTEX call failed');
      throw new OrgatexProtocolError(`unexpected status ${res.status} for ${operation}`);
    }
    this.opts.logger.info(log('ok'), 'OrgaTEX call');
    return res.body;
  }

  private markOnline() {
    this.link = { state: 'ONLINE', lastContactAt: this.now().toISOString() };
  }

  private markOffline() {
    this.link = { state: 'OFFLINE', lastContactAt: this.link.lastContactAt };
  }
}
