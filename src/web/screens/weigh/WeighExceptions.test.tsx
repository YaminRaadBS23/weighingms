// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionView } from '../../../shared/weighing';
import {
  apiError,
  installMockApi,
  SESSION,
  type Handler,
  type MockApi,
  type Reply,
} from '../../test/mock-api';
import { WeighScreen } from './WeighScreen';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

const PREP = {
  state: 'UNLOCKED' as const,
  identityVerified: true,
  lot: { lotId: '2026-0001', source: 'DEFAULT' as const },
  container: {
    containerId: 'C-01',
    tare: { value: '214.0', unit: 'g' as const },
    source: 'DEFAULT' as const,
  },
  tareApplied: { value: '214.0', unit: 'g' as const },
};

const unlocked: SessionView = {
  ...SESSION,
  components: SESSION.components.map((c) =>
    c.sequence === 1
      ? {
          ...c,
          scale: { scaleId: 'scale-a', mode: 'AUTO' as const, reason: null },
          preparation: PREP,
        }
      : c,
  ),
};

const reading = (value: string): Reply => ({
  body: { weight: { value, unit: 'g' }, stable: true, connected: true, at: 'x' },
});

function Host({ initial }: { initial: SessionView }) {
  const [session, setSession] = useState(initial);
  return <WeighScreen session={session} onSession={setSession} onLeave={() => {}} />;
}

const setup = (weight: Handler, extra: Record<string, Handler> = {}) => {
  mock = installMockApi({
    'GET /api/scales/scale-a/weight': weight,
    [`GET /api/sessions/${SESSION.sessionId}`]: { body: unlocked },
    ...extra,
  });
  return render(<Host initial={unlocked} />);
};

const overrideKey = () =>
  screen.getByRole('button', { name: 'Supervisor override' }) as HTMLButtonElement;
const okKey = () => screen.getByRole('button', { name: /OK · Confirm/ }) as HTMLButtonElement;
const OVERRIDE = `POST /api/sessions/S-1/components/1/override`;

describe('Surplus panel', () => {
  it.each([
    ['96.4', 'Surplus +2.4 g (+2.6%) — over tolerance'],
    ['94.6', 'Surplus +0.6 g (+0.6%) — over tolerance'],
  ])('%s g shows the surplus from the target and the recovery options', async (w, title) => {
    setup(reading(w));
    const panel = await screen.findByTestId('surplus-panel');
    expect(panel.textContent).toContain(title);
    expect(panel.textContent).toContain('Re-tare');
    expect(panel.textContent).toContain('A supervisor can override');
    expect(okKey().disabled).toBe(true);
    expect(overrideKey().disabled).toBe(false);
  });

  it('is absent within tolerance and below the target', async () => {
    setup(reading('94.0'));
    await screen.findByText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    expect(screen.queryByTestId('surplus-panel')).toBeNull();
    expect(overrideKey().disabled).toBe(true);
  });

  it('disappears when the excess is removed', async () => {
    let w = '96.4';
    setup(() => reading(w));
    await screen.findByTestId('surplus-panel');
    w = '94.0';
    await waitFor(() => expect(screen.queryByTestId('surplus-panel')).toBeNull());
    expect(okKey().disabled).toBe(false);
  });
});

describe('Scale failure states', () => {
  it('a lost scale shows the notice, blocks OK and override, then asks for a re-tare', async () => {
    let down = false;
    setup(() => (down ? apiError(503, 'SCALE_OFFLINE', 'offline') : reading('96.4')));
    await screen.findByTestId('surplus-panel');
    down = true;
    expect(
      await screen.findByText(
        'Scale unavailable — check the scale connection.',
        {},
        { timeout: 4000 },
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('weight-now').textContent).toBe('Scale unavailable');
    expect(screen.getByText('SCALE UNAVAILABLE — WEIGHING STOPPED')).toBeTruthy();
    expect(okKey().disabled).toBe(true);
    expect(overrideKey().disabled).toBe(true);
    expect(screen.queryByTestId('surplus-panel')).toBeNull();

    down = false;
    expect(await screen.findByText('The scale is back — re-tare to continue.')).toBeTruthy();
    expect(okKey().disabled).toBe(true);
    expect(screen.getByTestId('ok-reason').textContent).toBe('Re-tare after the scale reconnected');
  }, 10000);

  it('Re-tare after a reconnect clears the notice', async () => {
    let down = false;
    setup(() => (down ? apiError(503, 'SCALE_OFFLINE', 'offline') : reading('94.0')), {
      'POST /api/sessions/S-1/components/1/retare': { body: unlocked },
    });
    await screen.findByText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    down = true;
    await screen.findByText(
      'Scale unavailable — check the scale connection.',
      {},
      { timeout: 4000 },
    );
    down = false;
    await screen.findByText('The scale is back — re-tare to continue.');
    await userEvent.click(screen.getByRole('button', { name: /Re-tare/ }));
    await waitFor(() => expect(screen.queryByText(/re-tare to continue/)).toBeNull());
    await waitFor(() => expect(okKey().disabled).toBe(false));
  }, 10000);

  it('a brief gap below the loss limit shows no notice', async () => {
    let down = false;
    setup(() => (down ? apiError(503, 'SCALE_OFFLINE', 'offline') : reading('94.0')));
    await screen.findByText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    down = true;
    await new Promise((r) => setTimeout(r, 500));
    down = false;
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/Scale unavailable/)).toBeNull();
    expect(screen.queryByText(/re-tare to continue/)).toBeNull();
  });

  it('expired calibration shows the blocking notice and keeps OK and override off', async () => {
    setup(reading('96.4'), {
      'GET /api/scales': {
        body: {
          items: [
            {
              scaleId: 'scale-a',
              class: 'PRECISION',
              capacity: { value: '3', unit: 'kg' },
              unit: 'g',
              resolution: { value: '0.1', unit: 'g' },
              calibrationDueAt: '2020-01-01T00:00:00Z',
              calibration: 'EXPIRED',
              state: 'CAL_EXPIRED',
            },
          ],
        },
      },
    });
    expect(
      await screen.findByText(
        'Calibration expired on this scale — weighing is blocked. Ask a supervisor to choose another scale.',
      ),
    ).toBeTruthy();
    expect(okKey().disabled).toBe(true);
    expect(overrideKey().disabled).toBe(true);
    expect(screen.getByTestId('ok-reason').textContent).toBe('Calibration expired on this scale');
  });
});

describe('Supervisor override dialog', () => {
  const open = async () => {
    await screen.findByTestId('surplus-panel');
    await userEvent.click(overrideKey());
    return screen.getByRole('dialog', { name: 'Supervisor override' });
  };
  const fill = async (dlg: HTMLElement, badge: string, pin: string, reason: string) => {
    if (badge) await userEvent.type(within(dlg).getByLabelText('Supervisor badge'), badge);
    if (pin) await userEvent.type(within(dlg).getByLabelText('PIN'), pin);
    if (reason) await userEvent.type(within(dlg).getByLabelText(/Reason/), reason);
  };

  it('shows the awaiting status, masks the PIN and needs badge, PIN and reason', async () => {
    setup(reading('96.4'));
    const dlg = await open();
    expect(within(dlg).getByText('OVERRIDE REQUESTED — AWAITING SUPERVISOR')).toBeTruthy();
    const pin = within(dlg).getByLabelText('PIN') as HTMLInputElement;
    expect(pin.type).toBe('password');
    expect(pin.autocomplete).toBe('off');
    const submit = within(dlg).getByRole('button', { name: 'Authorise' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await fill(dlg, 'BDG-0901', '2580', '');
    expect(submit.disabled).toBe(true); // reason missing
    await fill(dlg, '', '', 'Customer accepts');
    expect(submit.disabled).toBe(false);
    expect(within(dlg).getByText('16 / 500')).toBeTruthy();
  });

  it('sends badge, PIN and reason only — no weight — and applies the returned session', async () => {
    let body: unknown;
    const after: SessionView = { ...unlocked, doneCount: 1, activeSequence: 2 };
    setup(reading('96.4'), {
      [OVERRIDE]: (req) => {
        body = req.body;
        return { body: { record: {}, session: after } };
      },
    });
    const dlg = await open();
    await fill(dlg, 'BDG-0901', '2580', 'Customer accepts');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Authorise' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(body).toEqual({ supervisorBadge: 'BDG-0901', pin: '2580', reason: 'Customer accepts' });
    expect(
      mock.calls.filter((c) => c === `POST /api/sessions/S-1/components/1/override`),
    ).toHaveLength(1);
  });

  it('a refused authorisation stays in the dialog, in words, and clears the PIN', async () => {
    setup(reading('96.4'), {
      [OVERRIDE]: apiError(403, 'NOT_AUTHORISED', 'no'),
    });
    const dlg = await open();
    await fill(dlg, 'BDG-0417', '0000', 'Reason');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Authorise' }));
    expect(await within(dlg).findByText('Badge or PIN not accepted for a supervisor')).toBeTruthy();
    expect((within(dlg).getByLabelText('PIN') as HTMLInputElement).value).toBe('');
    expect((within(dlg).getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe('Reason');
  });

  it('Cancel and Escape close it without calling the server', async () => {
    setup(reading('96.4'));
    let dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    dlg = await open();
    await userEvent.type(within(dlg).getByLabelText('Supervisor badge'), '{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mock.calls.some((c) => c.includes('/override'))).toBe(false);
  });
});

describe('Change scale dialog', () => {
  const options = {
    body: {
      requirement: { value: '94.0', unit: 'g' },
      items: [
        {
          scaleId: 'scale-a',
          capacity: { value: '3', unit: 'kg' },
          fits: true,
          usable: true,
          state: 'READY',
          selected: true,
        },
        {
          scaleId: 'scale-b',
          capacity: { value: '32', unit: 'kg' },
          fits: true,
          usable: false,
          state: 'OFFLINE',
          selected: false,
        },
        {
          scaleId: 'scale-c',
          capacity: { value: '100', unit: 'g' },
          fits: false,
          usable: true,
          state: 'READY',
          selected: false,
        },
        {
          scaleId: 'scale-d',
          capacity: { value: '5', unit: 'kg' },
          fits: true,
          usable: true,
          state: 'READY',
          selected: false,
        },
      ],
    },
  };

  it('lists only scales that fit, marks the current one and disables unusable ones', async () => {
    setup(reading('94.0'), { 'GET /api/sessions/S-1/components/1/scale-options': options });
    await screen.findByText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    await userEvent.click(screen.getByRole('button', { name: 'Change scale' }));
    const dlg = screen.getByRole('dialog', { name: 'Change scale' });
    expect(await within(dlg).findByText(/scale-d/)).toBeTruthy();
    expect(within(dlg).queryByText(/scale-c/)).toBeNull();
    expect(within(dlg).getByText(/scale-a.*in use/)).toBeTruthy();
    const radios = within(dlg).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.disabled)).toEqual([true, true, false]);
    expect(within(dlg).getByText(/scale-b.*OFFLINE/)).toBeTruthy();
  });

  it('sends the chosen scale with badge and PIN and applies the new session', async () => {
    let body: unknown;
    setup(reading('94.0'), {
      'GET /api/sessions/S-1/components/1/scale-options': options,
      'POST /api/sessions/S-1/components/1/scale': (req) => {
        body = req.body;
        return { body: unlocked };
      },
    });
    await screen.findByText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    await userEvent.click(screen.getByRole('button', { name: 'Change scale' }));
    const dlg = screen.getByRole('dialog', { name: 'Change scale' });
    await userEvent.click(await within(dlg).findByRole('radio', { name: /scale-d/ }));
    await userEvent.type(within(dlg).getByLabelText('Supervisor badge'), 'BDG-0901');
    await userEvent.type(within(dlg).getByLabelText('PIN'), '2580');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Use this scale' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(body).toEqual({ scaleId: 'scale-d', supervisorBadge: 'BDG-0901', pin: '2580' });
  });

  it('shows a refusal in the dialog', async () => {
    setup(reading('94.0'), {
      'GET /api/sessions/S-1/components/1/scale-options': options,
      'POST /api/sessions/S-1/components/1/scale': apiError(403, 'NOT_AUTHORISED', 'no'),
    });
    await screen.findByText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    await userEvent.click(screen.getByRole('button', { name: 'Change scale' }));
    const dlg = screen.getByRole('dialog', { name: 'Change scale' });
    await userEvent.click(await within(dlg).findByRole('radio', { name: /scale-d/ }));
    await userEvent.type(within(dlg).getByLabelText('Supervisor badge'), 'x');
    await userEvent.type(within(dlg).getByLabelText('PIN'), '1');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Use this scale' }));
    expect(await within(dlg).findByText('Badge or PIN not accepted for a supervisor')).toBeTruthy();
  });
});

describe('Recipe rail', () => {
  it('marks an overridden component', async () => {
    const done: SessionView = {
      ...unlocked,
      components: unlocked.components.map((c) =>
        c.sequence === 1
          ? {
              ...c,
              state: 'DONE' as const,
              confirmed: {
                recordId: 'r1',
                actual: { value: '96.4', unit: 'g' as const },
                result: 'OVERRIDDEN' as const,
                confirmedAt: 'x',
              },
            }
          : c.sequence === 2
            ? { ...c, state: 'ACTIVE' as const }
            : c,
      ),
      activeSequence: 2,
      doneCount: 1,
    };
    mock = installMockApi({ 'GET /api/sessions/S-1': { body: done } });
    render(<Host initial={done} />);
    expect(await screen.findByText('✓ 96.4 g · OVERRIDDEN')).toBeTruthy();
  });
});
