/**
 * Typed client for the WeighingMS API. The station UI talks only to `/api/...` — never to the
 * Dummy systems under `/ext/...` (api-conventions.md).
 */
import type { BatchDetailResponse, BatchQueueResponse, RecipeResponse } from '../../shared/batches';
import type { ErrorBody } from '../../shared/errors';
import type {
  OrgatexStatusResponse,
  PrinterStatusResponse,
  ScanEvent,
  ScanFeedResponse,
  ScannerStatusResponse,
} from '../../shared/peripherals';
import type { ScaleListResponse } from '../../shared/scales';
import type {
  CurrentOperatorResponse,
  CurrentSessionResponse,
  OperatorView,
  SessionView,
} from '../../shared/weighing';

/** An error answered by the API, carrying its stable code (e.g. ORGATEX_UNAVAILABLE). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'WeighingMS server not reachable');
  }
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data as ErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? `HTTP ${res.status}`,
      err?.details ?? {},
    );
  }
  return data as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
const enc = encodeURIComponent;

export const api = {
  currentOperator: () => get<CurrentOperatorResponse>('/api/operators/current'),
  signIn: (badge: string) => post<OperatorView>('/api/operators/sign-in', { badge }),
  signOut: () => post<CurrentOperatorResponse>('/api/operators/sign-out'),

  currentSession: () => get<CurrentSessionResponse>('/api/sessions/current'),
  startSession: (batchId: string) => post<SessionView>('/api/sessions', { batchId }),

  batches: () => get<BatchQueueResponse>('/api/batches'),
  batch: (batchId: string) => get<BatchDetailResponse>(`/api/batches/${enc(batchId)}`),
  recipe: (batchId: string) => get<RecipeResponse>(`/api/batches/${enc(batchId)}/recipe`),

  scales: () => get<ScaleListResponse>('/api/scales'),
  scannerStatus: () => get<ScannerStatusResponse>('/api/scanner/status'),
  printerStatus: () => get<PrinterStatusResponse>('/api/printer/status'),
  orgatexStatus: () => get<OrgatexStatusResponse>('/api/orgatex/status'),

  scans: (since: number) => get<ScanFeedResponse>(`/api/scanner/scans?since=${since}`),
  manualCode: (code: string) => post<ScanEvent>('/api/scanner/manual', { code }),
};

export type Api = typeof api;
