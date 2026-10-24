// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import {
  BATCH_OK,
  installMockApi,
  OPERATOR,
  orgatexDown,
  QUEUE,
  RECIPE,
  SESSION,
  type MockApi,
} from './test/mock-api';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

const queueApi = () => ({
  'GET /api/batches': { body: QUEUE },
  [`GET /api/batches/${BATCH_OK.batchId}`]: { body: BATCH_OK },
  [`GET /api/batches/${BATCH_OK.batchId}/recipe`]: { body: RECIPE },
});

describe('App — restoring the station from the API', () => {
  it('no operator → only the sign-in screen is reachable', async () => {
    mock = installMockApi();
    render(<App />);
    expect(await screen.findByText('Scan your badge to sign in')).toBeTruthy();
    expect(screen.queryByText('Scan a batch card to begin')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('operator signed in, no session → Select batch with the operator chip', async () => {
    mock = installMockApi({
      ...queueApi(),
      'GET /api/operators/current': { body: { operator: OPERATOR } },
    });
    render(<App />);
    expect(await screen.findByText('Scan a batch card to begin')).toBeTruthy();
    expect(screen.getByText('A. Tester')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('a session in progress (reload) → the weigh screen with the batch crumb and components', async () => {
    mock = installMockApi({
      ...queueApi(),
      'GET /api/operators/current': { body: { operator: OPERATOR } },
      'GET /api/sessions/current': { body: { session: SESSION } },
    });
    render(<App />);
    expect(await screen.findByText('Scan dyestuff X-1')).toBeTruthy();
    expect(screen.getByTestId('crumb').textContent).toBe(
      `BATCH ${BATCH_OK.batchId} · ORDER ${BATCH_OK.orderRef} · MACHINE ${BATCH_OK.machineRef}`,
    );
    expect(screen.getByText('Recipe · Shade Q')).toBeTruthy();
    expect(screen.getByText('0 of 2 components weighed')).toBeTruthy();
    expect(screen.getAllByText('Dye 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('94.0 g', { exact: false })).toHaveLength(2); // one target per component
    expect(screen.getByText('WEIGHING')).toBeTruthy();
    expect(screen.queryByText('Scan a batch card to begin')).toBeNull();
  });

  it('a session in progress while OrgaTEX is offline still opens, with the batch ID only in the crumb', async () => {
    mock = installMockApi({
      'GET /api/operators/current': { body: { operator: OPERATOR } },
      'GET /api/sessions/current': { body: { session: SESSION } },
      [`GET /api/batches/${BATCH_OK.batchId}`]: orgatexDown(),
    });
    render(<App />);
    expect(await screen.findByText('Scan dyestuff X-1')).toBeTruthy();
    expect(screen.getByTestId('crumb').textContent).toBe(
      `BATCH ${BATCH_OK.batchId} · ORDER — · MACHINE —`,
    );
  });

  it('shows the sign-in screen when the API cannot be read at all', async () => {
    mock = installMockApi({ 'GET /api/operators/current': { status: 500, body: null } });
    render(<App />);
    expect(await screen.findByText('Scan your badge to sign in')).toBeTruthy();
  });
});

describe('App — the operator flow', () => {
  it('sign in → select batch → session starts → weigh screen', async () => {
    mock = installMockApi({
      ...queueApi(),
      'POST /api/scanner/manual': {
        body: { seq: null, code: OPERATOR.badgeId, kind: 'BADGE', source: 'MANUAL', at: 'x' },
      },
      'POST /api/operators/sign-in': { body: OPERATOR },
      'POST /api/sessions': { status: 201, body: SESSION },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Type code'), 'bdg-0001{Enter}');
    expect(await screen.findByText('Scan a batch card to begin')).toBeTruthy();
    expect(screen.getByText('A. Tester')).toBeTruthy();

    await user.click(await screen.findByTestId(`row-${BATCH_OK.batchId}`));
    expect(await screen.findByText('Scan dyestuff X-1')).toBeTruthy();
    expect(screen.getByTestId('crumb').textContent).toContain(`BATCH ${BATCH_OK.batchId}`);
    expect(mock.calls.some((c) => c.includes('/ext/'))).toBe(false);
  });

  it('Sign out returns to the sign-in screen', async () => {
    mock = installMockApi({
      ...queueApi(),
      'GET /api/operators/current': { body: { operator: OPERATOR } },
      'POST /api/operators/sign-out': { body: { operator: null } },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Scan your badge to sign in')).toBeTruthy();
    await waitFor(() => expect(mock.calls).toContain('POST /api/operators/sign-out'));
  });
});
