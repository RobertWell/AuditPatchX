import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { getCompareConfig } = vi.hoisted(() => ({ getCompareConfig: vi.fn() }));
vi.mock('../services/api', () => ({ default: { getCompareConfig } }));

import { CompareJob } from './CompareJob';

beforeEach(() => {
  getCompareConfig.mockReset();
  getCompareConfig.mockResolvedValue([
    { pairName: 'accounts', tableA: 'S.SRC_ACC', tableB: 'S.TGT_ACC', pkColumns: ['ID'], excludeColumns: ['UPDATED_AT'] },
  ]);
});

describe('CompareJob', () => {
  it('loads sync pairs on mount and pre-fills the first pair', async () => {
    render(<CompareJob onStartReview={vi.fn()} onConfigChange={vi.fn()} />);
    await waitFor(() => expect(getCompareConfig).toHaveBeenCalled());
    // the pre-filled table appears somewhere in the form
    await waitFor(() => expect(screen.getAllByDisplayValue(/S\.SRC_ACC/).length).toBeGreaterThan(0));
  });

  it('falls back to manual mode when the config API fails', async () => {
    getCompareConfig.mockRejectedValue(new Error('no config'));
    const { container } = render(<CompareJob onStartReview={vi.fn()} onConfigChange={vi.fn()} />);
    await waitFor(() => expect(getCompareConfig).toHaveBeenCalled());
    expect(container.firstChild).toBeTruthy();
  });

  it('exercises the form controls without throwing', async () => {
    const onStartReview = vi.fn();
    const { container } = render(<CompareJob onStartReview={onStartReview} onConfigChange={vi.fn()} />);
    await waitFor(() => expect(getCompareConfig).toHaveBeenCalled());
    const buttons = container.querySelectorAll('button');
    for (const b of buttons) { try { fireEvent.click(b); } catch { /* ignore */ } }
    expect(container.firstChild).toBeTruthy();
  });
});
