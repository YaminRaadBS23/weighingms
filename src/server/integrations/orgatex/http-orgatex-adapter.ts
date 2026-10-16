/**
 * HTTP adapter implementing OrgatexPort against the Dummy OrgaTEX training contract (/ext/orgatex).
 * Replacing the dummy with the real OrgaTEX means writing another adapter for the same port.
 */
import {
  BatchNotFoundError,
  BatchNotReleasedError,
  ConsumptionRejectedError,
  DomainError,
  DyestuffNotFoundError,
  IdempotencyConflictError,
  InvalidStatusTransitionError,
  LotNotFoundError,
  OrgatexProtocolError,
  OrgatexUnavailableError,
  RecipeNotFoundError,
} from '../../errors';
import type {
  DummyBatch,
  DummyBatchList,
  DummyConsumptionReceipt,
  DummyConsumptionRequest,
  DummyLot,
  DummyLotList,
  DummyRecipe,
  DummyStatusUpdate,
} from './dummy/contract';
import {
  errorOf,
  requestWithTimeout,
  type AdapterLogger,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from '../http';
import type {
  OrgatexBatch,
  OrgatexBatchQueue,
  OrgatexConsumptionPosting,
  OrgatexConsumptionReceipt,
  OrgatexLinkStatus,
  OrgatexLot,
  OrgatexPort,
  OrgatexRecipe,
  OrgatexWeighingStatus,
} from './orgatex-port';

export interface HttpOrgatexAdapterOptions {
  client: HttpClient;
  timeoutMs: number;
  logger: AdapterLogger;
  now?: () => Date;
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

const enc = encodeURIComponent;

export class HttpOrgatexAdapter implements OrgatexPort {
  private link: OrgatexLinkStatus = { state: 'UNKNOWN', lastContactAt: null };
  private readonly now: () => Date;

  constructor(private readonly opts: HttpOrgatexAdapterOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  getLinkStatus(): OrgatexLinkStatus {
    return { ...this.link };
  }

  async ping(): Promise<OrgatexLinkStatus> {
    try {
      await this.call('ping', { method: 'GET', path: '/ping' });
    } catch {
      // call() already marked the link OFFLINE and logged the failure.
    }
    return this.getLinkStatus();
  }

  async listBatches(stationId: string): Promise<OrgatexBatchQueue> {
    const body = await this.call('listBatches', {
      method: 'GET',
      path: `/stations/${enc(stationId)}/batches`,
    });
    const list = requireObject<DummyBatchList>(
      body,
      (b) => Array.isArray(b.items) && b.items.every(isBatch),
      'batch list',
    );
    return { batches: list.items.map(mapBatch), receivedAt: this.now().toISOString() };
  }

  async getBatch(batchId: string): Promise<OrgatexBatch> {
    const body = await this.call(
      'getBatch',
      { method: 'GET', path: `/batches/${enc(batchId)}` },
      { batchId },
    );
    return mapBatch(requireObject<DummyBatch>(body, isBatch, 'batch'));
  }

  async getRecipe(batchId: string): Promise<OrgatexRecipe> {
    const body = await this.call(
      'getRecipe',
      { method: 'GET', path: `/batches/${enc(batchId)}/recipe` },
      { batchId },
    );
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
      { method: 'GET', path: `/dyestuffs/${enc(dyestuffCode)}/lots` },
      { dyestuffCode },
    );
    const list = requireObject<DummyLotList>(body, (b) => Array.isArray(b.items), 'lot list');
    return list.items.map((l) => ({ lotId: l.lotId, dyestuffCode: l.dyestuffCode }));
  }

  async findLot(lotId: string): Promise<OrgatexLot> {
    const body = await this.call(
      'findLot',
      { method: 'GET', path: `/lots/${enc(lotId)}` },
      { lotId },
    );
    const lot = requireObject<DummyLot>(
      body,
      (b) => typeof b.lotId === 'string' && typeof b.dyestuffCode === 'string',
      'lot',
    );
    return { lotId: lot.lotId, dyestuffCode: lot.dyestuffCode };
  }

  async postConsumption(
    batchId: string,
    posting: OrgatexConsumptionPosting,
    idempotencyKey: string,
  ): Promise<OrgatexConsumptionReceipt> {
    const request: DummyConsumptionRequest = {
      completedAt: posting.completedAt,
      operatorId: posting.operatorId,
      lines: posting.lines.map((l) => ({ ...l })),
    };
    const body = await this.call(
      'postConsumption',
      {
        method: 'POST',
        path: `/batches/${enc(batchId)}/consumption`,
        body: request,
        headers: { 'idempotency-key': idempotencyKey },
      },
      { batchId, idempotencyKey },
    );
    const r = requireObject<DummyConsumptionReceipt>(
      body,
      (b) => typeof b.postingId === 'string' && Array.isArray(b.lines),
      'consumption receipt',
    );
    return {
      postingId: r.postingId,
      batchId: r.batchId,
      idempotencyKey: r.idempotencyKey,
      receivedAt: r.receivedAt,
      lines: r.lines.map((l) => ({ ...l })),
    };
  }

  async setBatchStatus(batchId: string, status: OrgatexWeighingStatus): Promise<OrgatexBatch> {
    const update: DummyStatusUpdate = { status };
    const body = await this.call(
      'setBatchStatus',
      { method: 'PATCH', path: `/batches/${enc(batchId)}/status`, body: update },
      { batchId, status },
    );
    return mapBatch(requireObject<DummyBatch>(body, isBatch, 'batch'));
  }

  /** Performs one request with timeout, translates failures, logs the outcome (brief IR-09). */
  private async call(
    operation: string,
    req: HttpRequest,
    ids: Record<string, string> = {},
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
    try {
      res = await requestWithTimeout(
        this.opts.client,
        req,
        this.opts.timeoutMs,
        () => new OrgatexUnavailableError(`timeout after ${this.opts.timeoutMs} ms`),
      );
    } catch (err) {
      const failure =
        err instanceof DomainError ? err : new OrgatexUnavailableError((err as Error).message);
      this.markOffline();
      this.opts.logger.warn(
        log('unavailable', { reason: failure.details?.reason }),
        'OrgaTEX call failed',
      );
      throw failure;
    }

    if (res.status >= 500) {
      this.markOffline();
      this.opts.logger.warn(log('unavailable', { status: res.status }), 'OrgaTEX call failed');
      throw new OrgatexUnavailableError(`OrgaTEX responded ${res.status}`);
    }

    this.markOnline();
    if (res.status === 200) {
      this.opts.logger.info(log('ok'), 'OrgaTEX call');
      return res.body;
    }

    const { code, message } = errorOf(res.body);
    if (res.status === 404) {
      this.opts.logger.info(log('not-found', { code }), 'OrgaTEX call');
    } else {
      this.opts.logger.warn(log('rejected', { status: res.status, code }), 'OrgaTEX call rejected');
    }
    throw this.translate(operation, res.status, code, message ?? '', ids);
  }

  /** Maps a 4xx answer to the matching WeighingMS domain error. */
  private translate(
    operation: string,
    status: number,
    code: string | undefined,
    message: string,
    ids: Record<string, string>,
  ): DomainError {
    const batchId = ids.batchId ?? '';
    switch (code) {
      case 'BATCH_NOT_FOUND':
        return new BatchNotFoundError(batchId);
      case 'RECIPE_NOT_FOUND':
        return new RecipeNotFoundError(batchId);
      case 'LOT_NOT_FOUND':
        return new LotNotFoundError(ids.lotId ?? '');
      case 'DYESTUFF_NOT_FOUND':
        return new DyestuffNotFoundError(ids.dyestuffCode ?? '');
      case 'BATCH_NOT_RELEASED':
        return new BatchNotReleasedError(batchId);
      case 'IDEMPOTENCY_CONFLICT':
        return new IdempotencyConflictError(ids.idempotencyKey ?? '');
      case 'INVALID_STATUS_TRANSITION':
        return new InvalidStatusTransitionError(batchId, message);
      case 'CONSUMPTION_REJECTED':
        return new ConsumptionRejectedError(batchId, message);
      default:
        return new OrgatexProtocolError(
          `unexpected ${status}${code ? ` ${code}` : ''} for ${operation}`,
        );
    }
  }

  private markOnline() {
    this.link = { state: 'ONLINE', lastContactAt: this.now().toISOString() };
  }

  private markOffline() {
    this.link = { state: 'OFFLINE', lastContactAt: this.link.lastContactAt };
  }
}
