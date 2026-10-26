/**
 * Typed client for the WeighingMS API. The station UI talks only to `/api/...` — never to the
 * Dummy systems under `/ext/...` (api-conventions.md).
 */
import type { BatchDetailResponse, BatchQueueResponse, RecipeResponse } from '../../shared/batches';
import type {
  CompletionSummaryResponse,
  PendingCountResponse,
  WriteBackView,
} from '../../shared/completion';
import type { ErrorBody } from '../../shared/errors';
import type {
  OrgatexStatusResponse,
  PrinterStatusResponse,
  ScanEvent,
  ScanFeedResponse,
  ScannerStatusResponse,
} from '../../shared/peripherals';
import type { ScaleListResponse, WeightResponse } from '../../shared/scales';
import type { BatchTicketsResponse, TicketView } from '../../shared/ticket';
import type {
  ConfirmResponse,
  OverrideRequest,
  ReselectScaleRequest,
  ScaleOptionsResponse,
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
const component = (sessionId: string, sequence: number) =>
  `/api/sessions/${enc(sessionId)}/components/${sequence}`;

export const api = {
  currentOperator: () => get<CurrentOperatorResponse>('/api/operators/current'),
  signIn: (badge: string) => post<OperatorView>('/api/operators/sign-in', { badge }),
  signOut: () => post<CurrentOperatorResponse>('/api/operators/sign-out'),

  currentSession: () => get<CurrentSessionResponse>('/api/sessions/current'),
  startSession: (batchId: string) => post<SessionView>('/api/sessions', { batchId }),
  session: (sessionId: string) => get<SessionView>(`/api/sessions/${enc(sessionId)}`),
  activate: (sessionId: string, sequence: number) =>
    post<SessionView>(`${component(sessionId, sequence)}/activate`),
  verifyIdentity: (sessionId: string, sequence: number, code: string) =>
    post<SessionView>(`${component(sessionId, sequence)}/identity`, { code }),
  setLot: (sessionId: string, sequence: number, code: string) =>
    post<SessionView>(`${component(sessionId, sequence)}/lot`, { code }),
  setContainer: (sessionId: string, sequence: number, code: string) =>
    post<SessionView>(`${component(sessionId, sequence)}/container`, { code }),
  confirm: (sessionId: string, sequence: number) =>
    post<ConfirmResponse>(`${component(sessionId, sequence)}/confirm`),
  retare: (sessionId: string, sequence: number) =>
    post<SessionView>(`${component(sessionId, sequence)}/retare`),
  override: (sessionId: string, sequence: number, body: OverrideRequest) =>
    post<ConfirmResponse>(`${component(sessionId, sequence)}/override`, body),
  scaleOptions: (sessionId: string, sequence: number) =>
    get<ScaleOptionsResponse>(`${component(sessionId, sequence)}/scale-options`),
  reselectScale: (sessionId: string, sequence: number, body: ReselectScaleRequest) =>
    post<SessionView>(`${component(sessionId, sequence)}/scale`, body),
  quit: (sessionId: string) => post<SessionView>(`/api/sessions/${enc(sessionId)}/quit`),

  summary: (batchId: string) =>
    get<CompletionSummaryResponse>(`/api/batches/${enc(batchId)}/summary`),
  postConsumption: (batchId: string) =>
    post<WriteBackView>(`/api/batches/${enc(batchId)}/consumption`),
  retryWriteBack: (batchId: string) =>
    post<WriteBackView>(`/api/batches/${enc(batchId)}/write-back/retry`),
  pendingCount: () => get<PendingCountResponse>('/api/write-backs/pending-count'),

  createTicket: (batchId: string) => post<TicketView>('/api/tickets', { batchId }),
  ticketsForBatch: (batchId: string) =>
    get<BatchTicketsResponse>(`/api/batches/${enc(batchId)}/tickets`),
  printTicket: (ticketId: string) => post<TicketView>(`/api/tickets/${enc(ticketId)}/print`),
  reprintTicket: (ticketId: string) => post<TicketView>(`/api/tickets/${enc(ticketId)}/reprint`),

  batches: () => get<BatchQueueResponse>('/api/batches'),
  batch: (batchId: string) => get<BatchDetailResponse>(`/api/batches/${enc(batchId)}`),
  recipe: (batchId: string) => get<RecipeResponse>(`/api/batches/${enc(batchId)}/recipe`),

  scales: () => get<ScaleListResponse>('/api/scales'),
  weight: (scaleId: string) => get<WeightResponse>(`/api/scales/${enc(scaleId)}/weight`),
  scannerStatus: () => get<ScannerStatusResponse>('/api/scanner/status'),
  printerStatus: () => get<PrinterStatusResponse>('/api/printer/status'),
  orgatexStatus: () => get<OrgatexStatusResponse>('/api/orgatex/status'),

  scans: (since: number) => get<ScanFeedResponse>(`/api/scanner/scans?since=${since}`),
  manualCode: (code: string) => post<ScanEvent>('/api/scanner/manual', { code }),
};

export type Api = typeof api;
