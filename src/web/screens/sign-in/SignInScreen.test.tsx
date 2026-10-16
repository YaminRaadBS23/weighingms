// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  installMockApi,
  OPERATOR,
  scan,
  scanFeedDelivering,
  type MockApi,
} from '../../test/mock-api';
import { SignInScreen } from './SignInScreen';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

describe('SignInScreen', () => {
  it('asks the operator to scan or type a badge', () => {
    mock = installMockApi();
    render(<SignInScreen onSignedIn={() => {}} />);
    expect(screen.getByText('Scan your badge to sign in')).toBeTruthy();
    expect(screen.getByText('Or type the badge number below.')).toBeTruthy();
  });

  it('signs in with a typed badge through the API', async () => {
    mock = installMockApi({ 'POST /api/operators/sign-in': { body: OPERATOR } });
    mock.set('POST /api/scanner/manual', ({ body }) => ({
      body: {
        seq: null,
        code: String((body as { code: string }).code).toUpperCase(),
        kind: 'BADGE',
        source: 'MANUAL',
        at: 'x',
      },
    }));
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(<SignInScreen onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText('Type code'), 'bdg-0001{Enter}');
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(OPERATOR));
    expect(mock.calls).toContain('POST /api/operators/sign-in');
  });

  it('signs in with a scanned badge', async () => {
    mock = installMockApi({
      'POST /api/operators/sign-in': { body: OPERATOR },
      'GET /api/scanner/scans': scanFeedDelivering([scan(1, 'BDG-0001', 'BADGE')]),
    });
    const onSignedIn = vi.fn();
    render(<SignInScreen onSignedIn={onSignedIn} />);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(OPERATOR), { timeout: 3000 });
  });

  it('shows an error for an unknown or inactive badge and stays on the screen', async () => {
    mock = installMockApi({
      'POST /api/operators/sign-in': apiError(
        401,
        'OPERATOR_UNKNOWN',
        'Badge not recognised or operator inactive',
      ),
      'POST /api/scanner/manual': {
        body: { seq: null, code: 'BDG-9999', kind: 'BADGE', source: 'MANUAL', at: 'x' },
      },
    });
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(<SignInScreen onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText('Type code'), 'BDG-9999{Enter}');
    expect(await screen.findByText('Badge not recognised or operator inactive')).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('keeps the Enter key disabled until something is typed', async () => {
    mock = installMockApi();
    render(<SignInScreen onSignedIn={() => {}} />);
    const enter = screen.getByRole('button', { name: 'Enter' }) as HTMLButtonElement;
    expect(enter.disabled).toBe(true);
    await userEvent.setup().type(screen.getByLabelText('Type code'), 'B');
    expect(enter.disabled).toBe(false);
  });
});
