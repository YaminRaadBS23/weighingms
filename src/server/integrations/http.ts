/**
 * Shared HTTP plumbing for integration adapters (OrgaTEX, scales, …).
 * Adapters depend on the small HttpClient interface so tests can swap the network for Fastify inject.
 */
import type { FastifyInstance } from 'fastify';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  request(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse>;
}

/** The subset of a pino/Fastify logger adapters use. */
export interface AdapterLogger {
  debug?(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/** Parses a response body as JSON when possible. */
export function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Transport over the global fetch API. */
export function fetchHttpClient(baseUrl: string): HttpClient {
  const base = baseUrl.replace(/\/$/, '');
  return {
    async request(req, signal) {
      const res = await fetch(`${base}${req.path}`, {
        method: req.method,
        signal,
        headers: {
          accept: 'application/json',
          ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...req.headers,
        },
        ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
      });
      return { status: res.status, body: parseBody(await res.text()) };
    },
  };
}

/** Transport that calls an in-process route prefix through Fastify inject (tests). */
export function injectHttpClient(app: FastifyInstance, prefix: string): HttpClient {
  return {
    async request(req) {
      const res = await app.inject({
        method: req.method,
        url: `${prefix}${req.path}`,
        ...(req.headers ? { headers: req.headers } : {}),
        ...(req.body !== undefined ? { payload: req.body as object } : {}),
      });
      return { status: res.statusCode, body: parseBody(res.body) };
    },
  };
}

/**
 * Sends one request and rejects with `onTimeout()` if no answer arrives in time.
 * Network failures are rethrown as-is for the adapter to translate.
 */
export async function requestWithTimeout(
  client: HttpClient,
  req: HttpRequest,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<HttpResponse> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(onTimeout());
    }, timeoutMs);
  });
  try {
    return await Promise.race([client.request(req, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads `{ error: { code, message } }` from an error response body. */
export function errorOf(body: unknown): { code?: string; message?: string } {
  const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return {
    code: typeof err?.code === 'string' ? err.code : undefined,
    message: typeof err?.message === 'string' ? err.message : undefined,
  };
}
