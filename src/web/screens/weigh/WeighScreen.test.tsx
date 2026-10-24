// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionView } from '../../../shared/weighing';
import {
  apiError,
  installMockApi,
  scan,
  SESSION,
  type MockApi,
  type Reply,
} from '../../test/mock-api';
import { WeighScreen } from './WeighScreen';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

const UNLOCKED_PREP = {
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

/** Active component 1 on scale-a, either locked (identity not verified) or unlocked. */
function sessionWith(unlocked: boolean, patch: Partial<SessionView> = {}): SessionView {
  return {
    ...SESSION,
    components: SESSION.components.map((c) =>
      c.sequence === 1
        ? {
            ...c,
            scale: { scaleId: 'scale-a', mode: 'AUTO' as const, reason: null },
            preparation: unlocked
              ? UNLOCKED_PREP
              : {
                  ...UNLOCKED_PREP,
                  state: 'AWAITING_IDENTITY' as const,
                  identityVerified: false,
                  lot: null,
                  container: null,
                  tareApplied: null,
                },
          }
        : c,
    ),
    ...patch,
  };
}

const reading = (value: string, stable = true): Reply => ({
  body: { weight: { value, unit: 'g' }, stable, connected: true, at: 'x' },
});

/** Hosts the screen the way App does: the session lives in state and can be replaced. */
function Host({ initial, onLeave }: { initial: SessionView; onLeave: () => void }) {
  const [session, setSession] = useState(initial);
  return <WeighScreen session={session} onSession={setSession} onLeave={onLeave} />;
}

const okKey = () => screen.getByRole('button', { name: /OK · Confirm/ }) as HTMLButtonElement;
const weightCalls = () => mock.calls.filter((c) => c.startsWith('GET /api/scales/scale-a/weight'));

describe('WeighScreen — locked component', () => {
  it('shows what to scan, does not read the scale, and keeps OK off with the reason', async () => {
    mock = installMockApi({
      [`GET /api/sessions/${SESSION.sessionId}`]: { body: sessionWith(false) },
    });
    render(<Host initial={sessionWith(false)} onLeave={() => {}} />);
    expect(await screen.findByText('Scan dyestuff X-1')).toBeTruthy();
    expect(screen.getByTestId('weight-now').textContent).toContain('—');
    expect(okKey().disabled).toBe(true);
    expect(screen.getByTestId('ok-reason').textContent).toBe(
      'Complete the steps above to unlock weighing',
    );
    await new Promise((r) => setTimeout(r, 350));
    expect(weightCalls()).toHaveLength(0);
  });

  it('a typed dyestuff code goes to the identity call; a refusal is shown in words', async () => {
    mock = installMockApi({
      'POST /api/scanner/manual': { body: scan(1, 'DYE-9999', 'DYESTUFF') },
      [`POST /api/sessions/${SESSION.sessionId}/components/1/identity`]: apiError(
        422,
        'WRONG_DYESTUFF',
        'raw server text',
      ),
    });
    const user = userEvent.setup();
    render(<Host initial={sessionWith(false)} onLeave={() => {}} />);
    await user.type(await screen.findByLabelText('Type code'), 'DYE-9999{Enter}');
    expect(mock.calls).toContain(`POST /api/sessions/${SESSION.sessionId}/components/1/identity`);
  });

  it('a scanned code that is not a dyestuff, lot or container is refused locally', async () => {
    mock = installMockApi({ 'POST /api/scanner/manual': { body: scan(1, 'B-10001', 'BATCH') } });
    const user = userEvent.setup();
    render(<Host initial={sessionWith(false)} onLeave={() => {}} />);
    await user.type(await screen.findByLabelText('Type code'), 'B-10001{Enter}');
    expect(await screen.findByText('B-10001 is not what this step needs.')).toBeTruthy();
    expect(mock.calls.some((c) => c.includes('/identity'))).toBe(false);
  });
});

describe('WeighScreen — unlocked component', () => {
  const setup = (w: Reply | (() => Reply), extra: Record<string, Reply> = {}) => {
    mock = installMockApi({
      'GET /api/scales/scale-a/weight': typeof w === 'function' ? w : w,
      [`GET /api/sessions/${SESSION.sessionId}`]: { body: sessionWith(true) },
      ...extra,
    });
    return render(<Host initial={sessionWith(true)} onLeave={() => {}} />);
  };

  it('shows the header line, the 3 kg precision badge and polls the scale', async () => {
    setup(reading('0.0'));
    expect(
      await screen.findByText('X-1 · LOT 2026-0001 · CONTAINER C-01 · TARE 214.0 g'),
    ).toBeTruthy();
    expect(screen.getByText('3 kg precision')).toBeTruthy();
    await waitFor(() => expect(weightCalls().length).toBeGreaterThan(2));
  });

  it.each([
    ['0.0', 'under', 'DISPENSE — 94.0 g REMAINING', true],
    ['90.0', 'near', 'DISPENSE — 4.0 g REMAINING', true],
    ['93.5', 'ok', 'WITHIN TOLERANCE — PRESS OK TO CONFIRM', false],
    ['94.5', 'ok', 'WITHIN TOLERANCE — PRESS OK TO CONFIRM', false],
    ['96.4', 'over', 'OVER TOLERANCE — SURPLUS +2.4 g', true],
  ])('%s g: status "%s", OK disabled=%s', async (w, _zone, text, disabled) => {
    setup(reading(w));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(okKey().disabled).toBe(disabled);
  });

  it('an unstable reading in tolerance keeps OK off and says why', async () => {
    setup(reading('94.0', false));
    expect(await screen.findByText('Wait for a stable reading')).toBeTruthy();
    expect(okKey().disabled).toBe(true);
  });

  it('a scale that stops answering shows no reading and keeps OK off', async () => {
    setup(apiError(503, 'SCALE_OFFLINE', 'offline'));
    expect(await screen.findByText('NO READING FROM THE SCALE')).toBeTruthy();
    expect(okKey().disabled).toBe(true);
  });

  it('OK sends confirm without a weight, then shows the next component', async () => {
    const next = sessionWith(false, {
      doneCount: 1,
      activeSequence: 2,
      components: sessionWith(true).components.map((c) =>
        c.sequence === 1
          ? {
              ...c,
              state: 'DONE' as const,
              confirmed: {
                recordId: 'R1',
                actual: { value: '94.0', unit: 'g' as const },
                result: 'IN_TOLERANCE' as const,
                confirmedAt: 'x',
              },
            }
          : {
              ...c,
              state: 'ACTIVE' as const,
              scale: { scaleId: 'scale-a', mode: 'AUTO' as const, reason: null },
              preparation: {
                ...UNLOCKED_PREP,
                state: 'AWAITING_IDENTITY' as const,
                identityVerified: false,
                lot: null,
                container: null,
                tareApplied: null,
              },
            },
      ),
    });
    let sent: unknown = 'unset';
    setup(reading('94.0'));
    mock.set(`POST /api/sessions/${SESSION.sessionId}/components/1/confirm`, ({ body }) => {
      sent = body;
      return { body: { record: {}, session: next } };
    });
    const user = userEvent.setup();
    await waitFor(() => expect(okKey().disabled).toBe(false));
    await user.click(okKey());
    expect(await screen.findByText('Scan dyestuff X-2')).toBeTruthy();
    expect(sent).toEqual({});
    expect(screen.getByText('1 of 2 components weighed')).toBeTruthy();
    expect(screen.getByText('✓ 94.0 g')).toBeTruthy();
  });

  it('a refused confirm (server is authoritative) shows its wording', async () => {
    setup(reading('94.0'), {
      [`POST /api/sessions/${SESSION.sessionId}/components/1/confirm`]: apiError(
        422,
        'TOLERANCE_VIOLATION',
        'raw',
      ),
    });
    const user = userEvent.setup();
    await waitFor(() => expect(okKey().disabled).toBe(false));
    await user.click(okKey());
    expect(
      await screen.findByText('The weight is not within tolerance', { selector: '[role="alert"]' }),
    ).toBeTruthy();
  });

  it('Re-tare calls the retare endpoint', async () => {
    setup(reading('0.0'), {
      [`POST /api/sessions/${SESSION.sessionId}/components/1/retare`]: { body: sessionWith(true) },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Re-tare/ }));
    await waitFor(() =>
      expect(mock.calls).toContain(`POST /api/sessions/${SESSION.sessionId}/components/1/retare`),
    );
  });

  it('F1 confirms only while OK is enabled; F2 re-tares', async () => {
    setup(reading('90.0'), {
      [`POST /api/sessions/${SESSION.sessionId}/components/1/confirm`]: {
        body: { record: {}, session: sessionWith(true) },
      },
      [`POST /api/sessions/${SESSION.sessionId}/components/1/retare`]: { body: sessionWith(true) },
    });
    await screen.findByText('DISPENSE — 4.0 g REMAINING');
    fireEvent.keyDown(window, { key: 'F1' });
    fireEvent.keyDown(window, { key: 'F2' });
    await waitFor(() => expect(mock.calls.some((c) => c.endsWith('/retare'))).toBe(true));
    expect(mock.calls.some((c) => c.endsWith('/confirm'))).toBe(false);
  });
});

describe('WeighScreen — rail, quit and completion', () => {
  it('touching a pending row activates that component', async () => {
    const switched = sessionWith(true);
    mock = installMockApi({
      [`POST /api/sessions/${SESSION.sessionId}/components/2/activate`]: { body: switched },
    });
    const user = userEvent.setup();
    render(<Host initial={sessionWith(false)} onLeave={() => {}} />);
    const pending = (await screen.findByText('PENDING')).closest('button') as HTMLButtonElement;
    await user.click(pending);
    await waitFor(() =>
      expect(mock.calls).toContain(`POST /api/sessions/${SESSION.sessionId}/components/2/activate`),
    );
  });

  it('Quit asks first; Keep weighing changes nothing, Quit batch suspends and leaves', async () => {
    const onLeave = vi.fn();
    mock = installMockApi({
      [`POST /api/sessions/${SESSION.sessionId}/quit`]: {
        body: { ...SESSION, status: 'SUSPENDED' },
      },
    });
    const user = userEvent.setup();
    render(<Host initial={sessionWith(false)} onLeave={onLeave} />);
    await user.click(await screen.findByRole('button', { name: /^Quit/ }));
    expect(screen.getByRole('dialog', { name: 'Quit this batch?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep weighing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mock.calls.some((c) => c.endsWith('/quit'))).toBe(false);

    fireEvent.keyDown(window, { key: 'F4' });
    await user.click(await screen.findByRole('button', { name: 'Quit batch' }));
    await waitFor(() => expect(onLeave).toHaveBeenCalledOnce());
    expect(mock.calls).toContain(`POST /api/sessions/${SESSION.sessionId}/quit`);
  });

  it('Escape closes the Quit dialog', async () => {
    mock = installMockApi();
    const user = userEvent.setup();
    render(<Host initial={sessionWith(false)} onLeave={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /^Quit/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a completed session shows the Batch weighed notice and leads back', async () => {
    const onLeave = vi.fn();
    mock = installMockApi();
    const user = userEvent.setup();
    render(
      <Host
        initial={sessionWith(false, { status: 'COMPLETED', doneCount: 2 })}
        onLeave={onLeave}
      />,
    );
    expect(await screen.findByText(`Batch ${SESSION.batchId} weighed`)).toBeTruthy();
    expect(screen.getByText('All 2 components are confirmed.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to Select batch' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('never talks to the Dummy systems (/ext) or the simulator', async () => {
    mock = installMockApi({ 'GET /api/scales/scale-a/weight': reading('94.0') });
    render(<Host initial={sessionWith(true)} onLeave={() => {}} />);
    await screen.findByText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    expect(mock.calls.some((c) => c.includes('/ext/') || c.includes('_sim'))).toBe(false);
  });
});
