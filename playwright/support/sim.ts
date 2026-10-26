import type { APIRequestContext } from '@playwright/test';

export interface Quantity {
  value: string;
  unit: 'g' | 'kg';
}

/** The training simulation controls (the _sim routes of the Dummy systems), as the Training Panel uses them. */
export class Sim {
  constructor(private readonly request: APIRequestContext) {}

  private async post(path: string, data?: unknown) {
    const res = await this.request.post(path, data === undefined ? {} : { data });
    if (!res.ok()) throw new Error(`POST ${path} → ${res.status()} ${await res.text()}`);
    return res.json() as Promise<unknown>;
  }

  dispense = (scaleId: string, landing: Quantity) =>
    this.post(`/ext/scale/_sim/${scaleId}/dispense`, { landing });
  weight = (scaleId: string, net: Quantity) =>
    this.post(`/ext/scale/_sim/${scaleId}/weight`, { net });
  container = (scaleId: string, weight: Quantity) =>
    this.post(`/ext/scale/_sim/${scaleId}/container`, { weight });
  disconnect = (scaleId: string) => this.post(`/ext/scale/_sim/${scaleId}/disconnect`);
  reconnect = (scaleId: string) => this.post(`/ext/scale/_sim/${scaleId}/reconnect`);
  calibration = (scaleId: string, expired: boolean) =>
    this.post(`/ext/scale/_sim/${scaleId}/calibration`, { expired });
  printer = (state: 'READY' | 'OFFLINE' | 'OUT_OF_PAPER') =>
    this.post('/ext/printer/_sim/state', { state });
  orgatex = (state: 'offline' | 'online') => this.post(`/ext/orgatex/_sim/${state}`);

  /** What the Dummy systems have received. */
  async printerJobs(): Promise<unknown[]> {
    const res = await this.request.get('/ext/printer/jobs');
    const body = (await res.json()) as { items?: unknown[]; jobs?: unknown[] };
    return body.items ?? body.jobs ?? [];
  }
  async orgatexPostings(): Promise<number> {
    const res = await this.request.get('/ext/orgatex/_sim/state');
    return ((await res.json()) as { postings: number }).postings;
  }
}

export const q = (value: string | number, unit: 'g' | 'kg'): Quantity => ({
  value: String(value),
  unit,
});
