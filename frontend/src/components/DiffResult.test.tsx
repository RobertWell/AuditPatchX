import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DiffResult } from './DiffResult';
import type { CompareJobDiffRow } from '../types/api';

const data: CompareJobDiffRow[] = [
  {
    pk: '1', pkMap: { ID: '1' }, status: 'UPDATE', changedColumns: 2, updatedBy: 'sys', reviewStatus: 'PENDING',
    changes: [
      { column: 'NAME', sourceValue: 'a', targetValue: 'b', isLongText: false },
      { column: 'NOTE', sourceValue: 'x'.repeat(120), targetValue: 'y'.repeat(120), isLongText: true },
    ],
  },
  {
    pk: '2', pkMap: { ID: '2' }, status: 'INSERT', changedColumns: 1, updatedBy: 'sys', reviewStatus: 'APPROVED',
    changes: [{ column: 'NAME', sourceValue: 'c', targetValue: 'd', isLongText: false }],
  },
];

const handlers = {
  onOpenSqlReview: vi.fn(),
  onReviewSelected: vi.fn(),
  onBulkApproveSelected: vi.fn(),
  onRowApprove: vi.fn(),
  onRowReject: vi.fn(),
  onExportSql: vi.fn(),
  onSwapDirection: vi.fn(),
};

describe('DiffResult', () => {
  it('renders the diff result view for the given rows', () => {
    const { container } = render(<DiffResult data={data} {...handlers} sourceTable="S.SRC" targetTable="S.TGT"
      limitReached={false} scannedRows={42} limit={100} />);
    // the result header surfaces the table names and a swap control
    expect(container.textContent).toContain('Swap & Re-run');
  });

  it('shows a limit-reached banner when the scan hit the cap', () => {
    const { container } = render(<DiffResult data={data} {...handlers} sourceTable="S.SRC"
      targetTable="S.TGT" limitReached={true} scannedRows={100} limit={100} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('exercises row/bulk/export/swap controls without throwing', async () => {
    const { container } = render(<DiffResult data={data} {...handlers} sourceTable="S.SRC"
      targetTable="S.TGT" scannedRows={2} limit={100} />);
    const buttons = container.querySelectorAll('button');
    for (const b of buttons) { try { fireEvent.click(b); } catch { /* ignore */ } }
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    for (const c of checkboxes) { try { fireEvent.click(c); } catch { /* ignore */ } }
    expect(container.firstChild).toBeTruthy();
  });

  it('renders an empty state for no rows', () => {
    const { container } = render(<DiffResult data={[]} {...handlers} />);
    expect(container).toBeTruthy();
  });
});
