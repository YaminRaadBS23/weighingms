// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATOR } from '../test/mock-api';
import { TopBar } from './TopBar';

afterEach(cleanup);

describe('TopBar', () => {
  it('shows the brand, the batch crumb and the operator chip', () => {
    render(
      <TopBar
        stationLabel="01"
        crumb={{ batchId: 'B-10001', orderRef: 'SO-0001', machineRef: 'M-1' }}
        operator={OPERATOR}
        onSignOut={() => {}}
      />,
    );
    expect(screen.getByText('WeighingMS')).toBeTruthy();
    expect(screen.getByText('STATION 01')).toBeTruthy();
    expect(screen.getByTestId('crumb').textContent).toBe(
      'BATCH B-10001 · ORDER SO-0001 · MACHINE M-1',
    );
    expect(screen.getByText('Operator', { exact: false }).textContent).toContain('A. Tester');
    expect(screen.getByText('Operator', { exact: false }).textContent).toContain('Shift X');
  });

  it('Sign out calls the handler', async () => {
    const onSignOut = vi.fn();
    render(<TopBar stationLabel="01" crumb={null} operator={OPERATOR} onSignOut={onSignOut} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows neither crumb nor operator when there is none', () => {
    render(<TopBar stationLabel="01" crumb={null} operator={null} onSignOut={() => {}} />);
    expect(screen.queryByTestId('crumb')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });
});
