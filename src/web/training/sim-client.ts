/**
 * The only code in the UI that talks to the Dummy systems: the training simulation controls
 * (the `_sim` routes under `/ext`, TRAINING ONLY). The operator screens use `services/api-client.ts` and never
 * reach `/ext` (api-conventions.md); a source test keeps it that way.
 */
import type { Quantity } from '../../shared/quantity';

export class SimError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SimError';
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new SimError(0, 'WeighingMS server not reachable');
  }
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data as { error?: { message?: string } } | null)?.error?.message;
    throw new SimError(res.status, message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export interface SimScale {
  scaleId: string;
  connected: boolean;
  unit: string;
  dispensing: boolean;
  reading: { net: Quantity; stable: boolean } | null;
}

export interface SimOrgatex {
  online: boolean;
  postings: number;
}

export type Availability = 'AVAILABLE' | 'DISABLED' | 'UNREACHABLE';
export type PrinterSimState = 'READY' | 'OFFLINE' | 'OUT_OF_PAPER';

const enc = encodeURIComponent;

export const sim = {
  /** 200 → the `_sim` routes exist; 404 → simulation is disabled (production). */
  async availability(): Promise<Availability> {
    try {
      await call('GET', '/ext/orgatex/_sim/state');
      return 'AVAILABLE';
    } catch (err) {
      return err instanceof SimError && err.status === 0 ? 'UNREACHABLE' : 'DISABLED';
    }
  },

  orgatexState: () => call<SimOrgatex>('GET', '/ext/orgatex/_sim/state'),
  orgatex: (action: 'offline' | 'online' | 'reset') =>
    call<SimOrgatex>('POST', `/ext/orgatex/_sim/${action}`),

  scaleState: () => call<{ scales: SimScale[] }>('GET', '/ext/scale/_sim/state'),
  dispense: (scaleId: string, landing: Quantity) =>
    call('POST', `/ext/scale/_sim/${enc(scaleId)}/dispense`, { landing }),
  setWeight: (scaleId: string, net: Quantity) =>
    call('POST', `/ext/scale/_sim/${enc(scaleId)}/weight`, { net }),
  placeContainer: (scaleId: string, weight: Quantity) =>
    call('POST', `/ext/scale/_sim/${enc(scaleId)}/container`, { weight }),
  disconnect: (scaleId: string) => call('POST', `/ext/scale/_sim/${enc(scaleId)}/disconnect`),
  reconnect: (scaleId: string) => call('POST', `/ext/scale/_sim/${enc(scaleId)}/reconnect`),
  calibration: (scaleId: string, expired: boolean) =>
    call('POST', `/ext/scale/_sim/${enc(scaleId)}/calibration`, { expired }),
  resetScales: () => call('POST', '/ext/scale/_sim/reset'),

  scanner: (action: 'offline' | 'online' | 'reset') => call('POST', `/ext/scanner/_sim/${action}`),
  scan: (code: string) => call('POST', '/ext/scanner/_sim/scan', { code }),

  printer: (state: PrinterSimState) => call('POST', '/ext/printer/_sim/state', { state }),
  resetPrinter: () => call('POST', '/ext/printer/_sim/reset'),
};
