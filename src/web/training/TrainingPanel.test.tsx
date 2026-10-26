// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionView } from '../../shared/weighing';
import { apiError, installMockApi, SESSION, type Handler, type MockApi } from '../test/mock-api';
import { TrainingPanel } from './TrainingPanel';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

const ok: Handler = { body: { ok: true } };

/** The component being weighed is #1 on scale-a, target 94.0 g ± 0.5 g. */
const weighing: SessionView = {
  ...SESSION,
  components: SESSION.components.map((c) =>
    c.sequence === 1
      ? { ...c, scale: { scaleId: 'scale-a', mode: 'AUTO' as const, reason: null } }
      : c,
  ),
};

const SIM_STATE = {
  scales: [
    { scaleId: 'scale-a', connected: true, unit: 'g', dispensing: false, reading: null },
    {
      scaleId: 'scale-b',
      connected: false,
      unit: 'kg',
      dispensing: false,
      reading: { net: { value: '1.250', unit: 'kg' }, stable: true },
    },
  ],
};

function open(overrides: Record<string, Handler> = {}) {
  mock = installMockApi({
    'GET /ext/orgatex/_sim/state': { body: { online: true, postings: 3 } },
    'GET /ext/scale/_sim/state': { body: SIM_STATE },
    'GET /api/sessions/current': { body: { session: weighing } },
    ...overrides,
  });
  return render(<TrainingPanel />);
}

const sent = () => mock.calls.filter((c) => c.startsWith('POST '));
const button = (name: string | RegExp) => screen.getByRole('button', { name });

async function ready() {
  await screen.findByText('Simulate dispense');
  await screen.findByText(/Active component: D1 on scale-a, target 94.0 g/);
}

describe('TrainingPanel · availability', () => {
  it('offers no control and says so when simulation is disabled', async () => {
    open({ 'GET /ext/orgatex/_sim/state': apiError(404, 'NOT_FOUND', 'nope') });
    expect((await screen.findByRole('alert')).textContent).toContain('Simulation is disabled');
    expect(screen.queryByRole('button')).toBeNull();
    expect(mock.calls.every((c) => c.startsWith('GET '))).toBe(true);
  });

  it('says the server is not reachable when the probe cannot connect', async () => {
    open();
    mock.restore();
    globalThis.fetch = (() => Promise.reject(new TypeError('network'))) as typeof fetch;
    cleanup();
    render(<TrainingPanel />);
    expect((await screen.findByRole('alert')).textContent).toContain('not reachable');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the Dummy systems and the active component read from the normal APIs', async () => {
    open();
    await ready();
    expect(screen.getByText('scale-a · READY · no reading')).toBeTruthy();
    expect(screen.getByText('scale-b · READY · 1.250 kg')).toBeTruthy();
    expect(screen.getByText('OrgaTEX · ONLINE · 3 postings')).toBeTruthy();
    expect(screen.getByText('Scanner · READY')).toBeTruthy();
    expect(screen.getByText('Printer · READY')).toBeTruthy();
    expect(screen.getByText(/TRAINING — not part of the station/)).toBeTruthy();
  });

  it('says no component is being weighed when there is no active one', async () => {
    open({ 'GET /api/sessions/current': { body: { session: null } } });
    expect(await screen.findByText('No component is being weighed.')).toBeTruthy();
  });
});

describe('TrainingPanel · scale controls', () => {
  it('Simulate dispense lands exactly on the active target, on the active scale', async () => {
    const user = userEvent.setup();
    open({ 'POST /ext/scale/_sim/scale-a/dispense': ok });
    await ready();
    await user.click(button('Simulate dispense'));
    await waitFor(() => expect(sent()).toEqual(['POST /ext/scale/_sim/scale-a/dispense']));
    expect(await screen.findByText('Done: Simulate dispense')).toBeTruthy();
  });

  it('sends the landing weights: exact = target, overshoot = target + 3 × tolerance', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const record: Handler = ({ body }) => (bodies.push(body), { body: {} });
    open({ 'POST /ext/scale/_sim/scale-a/dispense': record });
    await ready();
    await user.click(button('Simulate dispense'));
    await user.click(button('Simulate overshoot'));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies).toEqual([
      { landing: { value: '94.0', unit: 'g' } },
      { landing: { value: '95.5', unit: 'g' } },
    ]);
  });

  it('refuses to aim a dispense when nothing is being weighed', async () => {
    const user = userEvent.setup();
    open({ 'GET /api/sessions/current': { body: { session: null } } });
    await screen.findByText('No component is being weighed.');
    await user.click(button('Simulate dispense'));
    expect(await screen.findByText(/failed: There is no component being weighed/)).toBeTruthy();
    expect(sent()).toEqual([]);
  });

  it('Set exact weight and Place container send the typed weight in the chosen unit', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown> = {};
    open({
      'POST /ext/scale/_sim/scale-a/weight': ({ body }) => (
        (bodies['weight'] = body),
        { body: {} }
      ),
      'POST /ext/scale/_sim/scale-a/container': ({ body }) => (
        (bodies['container'] = body),
        { body: {} }
      ),
    });
    await ready();
    const [exact, container] = screen.getAllByRole('group');
    const weightOf = (group: HTMLElement) => ({
      value: group.querySelector('input')!,
      unit: group.querySelector('select')!,
      go: group.querySelector('button')!,
    });
    const e = weightOf(exact!);
    await user.type(e.value, '94.0');
    await user.click(e.go);
    const c = weightOf(container!);
    await user.type(c.value, '1.5');
    await user.selectOptions(c.unit, 'kg');
    await user.click(c.go);
    await waitFor(() => expect(Object.keys(bodies)).toHaveLength(2));
    expect(bodies).toEqual({
      weight: { net: { value: '94.0', unit: 'g' } },
      container: { weight: { value: '1.5', unit: 'kg' } },
    });
  });

  it('rejects a weight that is not a plain decimal without calling the simulator', async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const [exact] = screen.getAllByRole('group');
    await user.type(exact!.querySelector('input')!, 'abc');
    await user.click(exact!.querySelector('button')!);
    expect(await screen.findByText(/failed: Enter a weight such as 94.0/)).toBeTruthy();
    expect(sent()).toEqual([]);
  });

  it('can aim at the other scale', async () => {
    const user = userEvent.setup();
    open({ 'POST /ext/scale/_sim/scale-b/disconnect': ok });
    await ready();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), 'scale-b');
    await user.click(button('Disconnect scale'));
    await waitFor(() => expect(sent()).toEqual(['POST /ext/scale/_sim/scale-b/disconnect']));
  });

  it('Disconnect, Reconnect, Expire and Restore calibration each call their own route', async () => {
    const user = userEvent.setup();
    const calibration: unknown[] = [];
    open({
      'POST /ext/scale/_sim/scale-a/disconnect': ok,
      'POST /ext/scale/_sim/scale-a/reconnect': ok,
      'POST /ext/scale/_sim/scale-a/calibration': ({ body }) => (
        calibration.push(body),
        { body: {} }
      ),
    });
    await ready();
    for (const name of [
      'Disconnect scale',
      'Reconnect scale',
      'Expire calibration',
      'Restore calibration',
    ]) {
      await user.click(button(name));
    }
    await waitFor(() => expect(sent()).toHaveLength(4));
    expect(sent()).toEqual([
      'POST /ext/scale/_sim/scale-a/disconnect',
      'POST /ext/scale/_sim/scale-a/reconnect',
      'POST /ext/scale/_sim/scale-a/calibration',
      'POST /ext/scale/_sim/scale-a/calibration',
    ]);
    expect(calibration).toEqual([{ expired: true }, { expired: false }]);
  });
});

describe('TrainingPanel · devices and OrgaTEX', () => {
  it('drives the scanner, the printer and OrgaTEX through their _sim routes', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown> = {};
    const take =
      (name: string): Handler =>
      ({ body }) => ((bodies[name] = body), { body: {} });
    open({
      'POST /ext/scanner/_sim/offline': ok,
      'POST /ext/scanner/_sim/online': ok,
      'POST /ext/scanner/_sim/scan': take('scan'),
      'POST /ext/printer/_sim/state': ({ body }) => (
        (bodies['printer'] as unknown[] | undefined) ?? (bodies['printer'] = []),
        (bodies['printer'] as unknown[]).push(body),
        { body: {} }
      ),
      'POST /ext/orgatex/_sim/offline': ok,
      'POST /ext/orgatex/_sim/online': ok,
    });
    await ready();
    await user.click(button('Scanner offline'));
    await user.click(button('Scanner online'));
    await user.click(button('Printer offline'));
    await user.click(button('Printer out of paper'));
    await user.click(button('Printer ready'));
    await user.click(button('OrgaTEX offline'));
    await user.click(button('OrgaTEX online'));
    await waitFor(() => expect(sent()).toHaveLength(7));
    expect(sent()).toEqual([
      'POST /ext/scanner/_sim/offline',
      'POST /ext/scanner/_sim/online',
      'POST /ext/printer/_sim/state',
      'POST /ext/printer/_sim/state',
      'POST /ext/printer/_sim/state',
      'POST /ext/orgatex/_sim/offline',
      'POST /ext/orgatex/_sim/online',
    ]);
    expect(bodies['printer']).toEqual([
      { state: 'OFFLINE' },
      { state: 'OUT_OF_PAPER' },
      { state: 'READY' },
    ]);
  });

  it('injects a scan only when a code is typed', async () => {
    const user = userEvent.setup();
    let scanned: unknown;
    open({ 'POST /ext/scanner/_sim/scan': ({ body }) => ((scanned = body), { body: {} }) });
    await ready();
    expect(button('Scan').hasAttribute('disabled')).toBe(true);
    await user.type(screen.getByLabelText('Code to scan'), ' D-1 ');
    await user.click(button('Scan'));
    await waitFor(() => expect(scanned).toEqual({ code: 'D-1' }));
  });

  it('Reset scenario resets the scales, scanner, printer and OrgaTEX, and nothing of WeighingMS', async () => {
    const user = userEvent.setup();
    open({
      'POST /ext/scale/_sim/reset': ok,
      'POST /ext/scanner/_sim/reset': ok,
      'POST /ext/printer/_sim/reset': ok,
      'POST /ext/orgatex/_sim/reset': ok,
    });
    await ready();
    await user.click(button('Reset scenario'));
    await waitFor(() => expect(sent()).toHaveLength(4));
    expect([...sent()].sort()).toEqual([
      'POST /ext/orgatex/_sim/reset',
      'POST /ext/printer/_sim/reset',
      'POST /ext/scale/_sim/reset',
      'POST /ext/scanner/_sim/reset',
    ]);
    expect(sent().some((c) => c.startsWith('POST /api'))).toBe(false);
  });

  it('shows what failed, in words, and keeps the panel usable', async () => {
    const user = userEvent.setup();
    open({ 'POST /ext/orgatex/_sim/offline': apiError(500, 'INTERNAL', 'simulator broke') });
    await ready();
    await user.click(button('OrgaTEX offline'));
    expect(await screen.findByText('OrgaTEX offline failed: simulator broke')).toBeTruthy();
    expect(button('OrgaTEX offline').hasAttribute('disabled')).toBe(false);
  });
});
