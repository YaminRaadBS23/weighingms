/**
 * Test helper: replaces `fetch` with an in-memory fake of the WeighingMS API so component tests
 * run without a server. Records every call as "METHOD /path?query".
 */
import type { BatchDetailResponse, BatchQueueResponse, RecipeResponse } from '../../shared/batches';
import type { ScanEvent } from '../../shared/peripherals';
import type { OperatorView, SessionView } from '../../shared/weighing';

export interface Reply {
  status?: number;
  body?: unknown;
}
export type Handler =
  Reply | ((req: { method: string; path: string; body: unknown }) => Reply | Promise<Reply>);

export interface MockApi {
  calls: string[];
  set(key: string, handler: Handler): void;
  restore(): void;
}

const err = (status: number, code: string, message: string, details = {}): Reply => ({
  status,
  body: { error: { code, message, details } },
});

export const orgatexDown = (): Reply => err(503, 'ORGATEX_UNAVAILABLE', 'OrgaTEX is not reachable');
export { err as apiError };

// ── Fixtures (test data only — the UI source contains none) ─────────────────────────────────

export const OPERATOR: OperatorView = {
  operatorId: 'OP-1',
  badgeId: 'BDG-0001',
  name: 'A. Tester',
  shift: 'Shift X',
  role: 'OPERATOR',
};

export const RECEIVED_AT = '2026-10-16T06:12:00.000Z';

const batch = (
  batchId: string,
  status: BatchDetailResponse['status'],
  selectable: boolean,
  reason: string | null,
): BatchDetailResponse => ({
  batchId,
  orderRef: `SO-${batchId.slice(-4)}`,
  machineRef: 'M-1',
  fabric: { description: 'knit', weight: { value: '480', unit: 'kg' } },
  shade: 'Shade Q',
  componentCount: 2,
  status,
  selectable,
  reason,
  releasedAt: null,
});

export const BATCH_OK = batch('B-10001', 'RELEASED', true, null);
export const BATCH_BLOCKED = batch('B-10002', 'QUEUED', false, 'Not released by OrgaTEX');

export const QUEUE: BatchQueueResponse = {
  items: [BATCH_OK, BATCH_BLOCKED],
  receivedAt: RECEIVED_AT,
};

export const RECIPE: RecipeResponse = {
  batchId: BATCH_OK.batchId,
  recipeId: 'R-1',
  shade: 'Shade Q',
  version: '1',
  components: [1, 2].map((sequence) => ({
    sequence,
    dyestuff: {
      code: `X-${sequence}`,
      name: `Dye ${sequence}`,
      shortName: `D${sequence}`,
      colourHex: '#336699',
      type: 'DYE',
    },
    target: { value: '94.0', unit: 'g' as const },
    tolerance: { value: '0.5', unit: 'g' as const },
    barMax: { value: '125', unit: 'g' as const },
    suggestedLotId: null,
  })),
};

export const SESSION: SessionView = {
  sessionId: 'S-1',
  batchId: BATCH_OK.batchId,
  stationId: 'STN-01',
  status: 'IN_PROGRESS',
  startedBy: { operatorId: OPERATOR.operatorId, name: OPERATOR.name },
  startedAt: RECEIVED_AT,
  updatedAt: RECEIVED_AT,
  recipe: { recipeId: 'R-1', version: '1', shade: 'Shade Q' },
  componentCount: 2,
  doneCount: 0,
  activeSequence: 1,
  components: RECIPE.components.map((c) => ({
    sequence: c.sequence,
    state: c.sequence === 1 ? ('ACTIVE' as const) : ('PENDING' as const),
    dyestuff: c.dyestuff,
    target: c.target,
    tolerance: c.tolerance,
    barMax: c.barMax,
    suggestedLotId: null,
    scale: null,
    requirement: null,
    preparation: null,
  })),
  orgatexStatusSync: 'SYNCED',
};

export const scan = (seq: number, code: string, kind: ScanEvent['kind']): ScanEvent => ({
  seq,
  code,
  kind,
  source: 'SCANNER',
  at: RECEIVED_AT,
});

/** A scan feed that first reports an empty buffer, then delivers `events` once. */
export function scanFeedDelivering(events: ScanEvent[]): Handler {
  let polls = 0;
  return () => {
    polls += 1;
    return polls === 1
      ? { body: { items: [], cursor: 0 } }
      : { body: { items: polls === 2 ? events : [], cursor: events.length } };
  };
}

const defaults = (): Record<string, Handler> => ({
  'GET /api/operators/current': { body: { operator: null } },
  'GET /api/sessions/current': { body: { session: null } },
  'GET /api/scanner/scans': { body: { items: [], cursor: 0 } },
  'GET /api/scanner/status': { body: { state: 'READY' } },
  'GET /api/printer/status': { body: { state: 'READY' } },
  'GET /api/orgatex/status': {
    body: { state: 'ONLINE', lastContactAt: '2026-10-16T07:41:00.000Z' },
  },
  'GET /api/scales': {
    body: {
      items: [
        {
          scaleId: 'scale-a',
          class: 'PRECISION',
          capacity: { value: '3', unit: 'kg' },
          unit: 'g',
          resolution: { value: '0.1', unit: 'g' },
          calibrationDueAt: '2027-01-01T00:00:00Z',
          calibration: 'VALID',
          state: 'READY',
        },
        {
          scaleId: 'scale-b',
          class: 'FLOOR',
          capacity: { value: '32', unit: 'kg' },
          unit: 'kg',
          resolution: { value: '0.001', unit: 'kg' },
          calibrationDueAt: '2027-01-01T00:00:00Z',
          calibration: 'VALID',
          state: 'READY',
        },
      ],
    },
  },
});

export function installMockApi(overrides: Record<string, Handler> = {}): MockApi {
  const handlers = new Map<string, Handler>(Object.entries({ ...defaults(), ...overrides }));
  const calls: string[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    const handler = handlers.get(`${method} ${path.split('?')[0]}`);
    const reply: Reply = !handler
      ? err(404, 'NOT_FOUND', `no mock for ${method} ${path}`)
      : typeof handler === 'function'
        ? await handler({
            method,
            path,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
          })
        : handler;
    return new Response(JSON.stringify(reply.body ?? null), { status: reply.status ?? 200 });
  }) as typeof fetch;

  return {
    calls,
    set: (key, handler) => void handlers.set(key, handler),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
