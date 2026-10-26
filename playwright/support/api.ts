import type { APIRequestContext } from '@playwright/test';
import { Sim, q, type Quantity } from './sim';

export const OPERATOR_BADGE = 'BDG-0417';
export const SUPERVISOR_BADGE = 'BDG-0901';
/** The documented training PIN (README.md); the seed stores only its hash. */
export const SUPERVISOR_PIN = '2580';
export const INACTIVE_BADGE = 'BDG-0999';
export const BATCH = 'B-24187';

export interface RecipeComponent {
  sequence: number;
  dyestuff: { code: string; name: string; shortName: string };
  target: Quantity;
  tolerance: Quantity;
}

interface SessionComponent {
  sequence: number;
  state: string;
  scale: { scaleId: string | null } | null;
  target: Quantity;
  tolerance: Quantity;
  dyestuff: { code: string; shortName: string };
}

/** The few fields of a JSON reply the tests assert on. */
export interface ApiBody {
  error?: { code: string; message: string };
  items?: { sequence: number; result: string }[];
  records?: { sequence: number; result: string }[];
  tickets?: unknown[];
  operator?: unknown;
}

export interface Session {
  sessionId: string;
  status: string;
  components: SessionComponent[];
}

/** Drives the WeighingMS API directly: set-up for tests that begin part-way through a batch. */
export class Api {
  readonly sim: Sim;
  constructor(private readonly request: APIRequestContext) {
    this.sim = new Sim(request);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
    const res = await this.request.fetch(path, { method, ...(data ? { data } : {}) });
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** A call whose refusal is the thing under test: status and body, never thrown. */
  async attempt(method: 'GET' | 'POST', path: string, data?: unknown) {
    const res = await this.request.fetch(path, { method, ...(data ? { data } : {}) });
    return { status: res.status(), body: (await res.json()) as ApiBody };
  }

  signIn = (badge = OPERATOR_BADGE) => this.call('POST', '/api/operators/sign-in', { badge });
  recipe = async (batchId = BATCH) =>
    (await this.call<{ components: RecipeComponent[] }>('GET', `/api/batches/${batchId}/recipe`))
      .components;
  session = (sessionId: string) => this.call<Session>('GET', `/api/sessions/${sessionId}`);
  currentSession = async () =>
    (await this.call<{ session: Session | null }>('GET', '/api/sessions/current')).session;
  start = (batchId = BATCH) => this.call<Session>('POST', '/api/sessions', { batchId });

  /** The component being weighed now, with the scale chosen for it. */
  async active(sessionId: string) {
    const s = await this.session(sessionId);
    const c = s.components.find((x) => x.state === 'ACTIVE');
    if (!c?.scale?.scaleId) throw new Error('no active component with a scale');
    return { ...c, scaleId: c.scale.scaleId };
  }

  /** Waits until the scale reports a stable reading (it settles 500 ms after the last change). */
  async settled(scaleId: string) {
    for (let i = 0; i < 60; i += 1) {
      const w = await this.call<{ stable: boolean }>('GET', `/api/scales/${scaleId}/weight`);
      if (w.stable) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`scale ${scaleId} never settled`);
  }

  /** Signs in, starts B-24187 and confirms its first `count` components through the API. */
  async weighFirst(count: number, batchId = BATCH): Promise<Session> {
    await this.signIn();
    const session = await this.start(batchId);
    for (let seq = 1; seq <= count; seq += 1) {
      const base = `/api/sessions/${session.sessionId}/components/${seq}`;
      const c = session.components.find((x) => x.sequence === seq)!;
      if (seq > 1) await this.call('POST', `${base}/activate`);
      await this.call('POST', `${base}/identity`, { code: c.dyestuff.code });
      const { scaleId } = await this.active(session.sessionId);
      await this.sim.weight(scaleId, c.target);
      await this.settled(scaleId);
      await this.call('POST', `${base}/confirm`);
    }
    return this.session(session.sessionId);
  }
}

export { q };
