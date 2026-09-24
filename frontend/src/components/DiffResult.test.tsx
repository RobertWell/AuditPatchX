import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

type ResultProps = ComponentProps<typeof DiffResult>;

function renderResult(overrides: Partial<ResultProps> = {}) {
  const handlers = {
    onOpenSqlReview: vi.fn(), onReviewSelected: vi.fn(), onBulkApproveSelected: vi.fn(),
    onRowApprove: vi.fn(), onRowReject: vi.fn(), onExportSql: vi.fn(), onSwapDirection: vi.fn(),
  };
  const props = { data, ...handlers, sourceTable: 'S.SRC', targetTable: 'S.TGT', scannedRows: 2, limit: 100, ...overrides } as ResultProps;
  const utils = render(<DiffResult {...props} />);
  return { ...utils, handlers, props };
}

/** Body rows only (the first role=row is the header). */
const bodyRows = () => screen.getAllByRole('row').slice(1);
/** The expand toggle is the row's first button (before Approve/Reject). */
const expandButton = (row: HTMLElement) => within(row).getAllByRole('button')[0];
const selectedCount = (selected: number, total = 2) =>
  screen.getByText(`Found ${total} differences • ${selected} selected`);

describe('DiffResult — header', () => {
  it('shows the sync direction, the subset counts, and wires swap/export', () => {
    const { handlers } = renderResult();
    expect(screen.getByTitle('Swap to TGT → SRC')).toBeInTheDocument();
    expect(screen.getByText('1 INSERT')).toBeInTheDocument();
    expect(screen.getByText('1 UPDATE')).toBeInTheDocument();
    expect(selectedCount(0)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Swap & Re-run/ }));
    expect(handlers.onSwapDirection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Export SQL' }));
    expect(handlers.onExportSql).toHaveBeenCalledTimes(1);
  });

  it('omits the direction header when the table names are missing', () => {
    renderResult({ sourceTable: undefined, targetTable: undefined });
    expect(screen.queryByText(/Swap & Re-run/)).toBeNull();
    expect(screen.queryByText('1 INSERT')).toBeNull();
    expect(screen.getByText('Comparison Results')).toBeInTheDocument();
  });

  it('hides the swap control when no handler is given', () => {
    renderResult({ onSwapDirection: undefined });
    expect(screen.queryByText(/Swap & Re-run/)).toBeNull();
    expect(screen.getByText('1 INSERT')).toBeInTheDocument();
  });

  it('warns when the scan was capped at the limit', () => {
    renderResult({ limitReached: true, scannedRows: 100 });
    expect(screen.getByText(/Results capped at limit \(100\)\. Only 100 source rows were scanned/)).toBeInTheDocument();
  });

  it('renders an empty result set with every selection action disabled', () => {
    renderResult({ data: [] });
    expect(screen.getByText('Found 0 differences • 0 selected')).toBeInTheDocument();
    expect(screen.getByText('0 INSERT')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: /Review Selected/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Approve Selected/ })).toBeDisabled();
  });
});

describe('DiffResult — rows', () => {
  it('expanding a row reveals its changes, with Deep Review only for long text', () => {
    const { handlers } = renderResult();
    const [row1] = bodyRows();
    expect(screen.queryByText('Deep Review')).toBeNull();

    fireEvent.click(expandButton(row1));
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('Long SQL content • Click "Deep Review" to compare')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deep Review' }));
    expect(handlers.onOpenSqlReview).toHaveBeenCalledWith(data[0], 'NOTE');

    fireEvent.click(expandButton(row1));
    expect(screen.queryByText('Deep Review')).toBeNull();
    expect(screen.queryByText('a')).toBeNull();
  });

  it('per-row Approve/Reject pass that row to the handlers', () => {
    const { handlers } = renderResult();
    const [, row2] = bodyRows();
    fireEvent.click(within(row2).getByRole('button', { name: 'Approve' }));
    fireEvent.click(within(row2).getByRole('button', { name: 'Reject' }));
    expect(handlers.onRowApprove).toHaveBeenCalledWith(data[1]);
    expect(handlers.onRowReject).toHaveBeenCalledWith(data[1]);
    expect(handlers.onRowApprove).not.toHaveBeenCalledWith(data[0]);
  });

  it('renders single, composite and missing primary keys and every status badge', () => {
    const rows: CompareJobDiffRow[] = [
      { ...data[0], pk: '1', pkMap: { ID: '1' }, status: 'UPDATE' },
      { ...data[1], pk: '2|9', pkMap: { ID: '2', SEQ: '9' }, status: 'DELETE', changes: [] },
      { ...data[1], pk: 'raw-3', pkMap: {}, status: 'CONFLICT' },
      { ...data[1], pk: '4', pkMap: undefined as unknown as Record<string, string>, status: 'IGNORED' },
    ];
    renderResult({ data: rows });
    expect(screen.getByText('raw-3')).toBeInTheDocument();
    expect(screen.getByTitle('9')).toHaveTextContent('9');
    expect(screen.getByText('SEQ')).toBeInTheDocument();
    for (const status of ['UPDATE', 'DELETE', 'CONFLICT', 'IGNORED']) {
      expect(screen.getByText(status)).toBeInTheDocument();
    }
    expect(screen.getByText('Found 4 differences • 0 selected')).toBeInTheDocument();
  });
});

describe('DiffResult — selection', () => {
  it('a single selection enables Review/Approve Selected and targets the long-text column', () => {
    const { handlers } = renderResult();
    const review = screen.getByRole('button', { name: /Review Selected/ });
    const approve = screen.getByRole('button', { name: /Approve Selected/ });
    expect(review).toBeDisabled();
    expect(approve).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    expect(selectedCount(1)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveAttribute('aria-checked', 'mixed');
    expect(review).toBeEnabled();
    expect(approve).toBeEnabled();

    fireEvent.click(review);
    expect(handlers.onReviewSelected).toHaveBeenCalledWith(data[0], 'NOTE');
    fireEvent.click(approve);
    expect(handlers.onBulkApproveSelected).toHaveBeenCalledWith([data[0]]);

    // unselecting the row disables both again
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    expect(selectedCount(0)).toBeInTheDocument();
    expect(review).toBeDisabled();
    expect(approve).toBeDisabled();
  });

  it('select-all toggles every row; with two selected only bulk approve is allowed', () => {
    const { handlers } = renderResult();
    const all = screen.getByRole('checkbox', { name: 'Select all rows' });
    fireEvent.click(all);
    expect(all).toHaveAttribute('aria-checked', 'true');
    expect(selectedCount(2)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review Selected/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Approve Selected/ }));
    expect(handlers.onBulkApproveSelected).toHaveBeenCalledWith(data);

    fireEvent.click(all);
    expect(all).toHaveAttribute('aria-checked', 'false');
    expect(selectedCount(0)).toBeInTheDocument();

    // a partial selection reads as indeterminate; select-all from there selects everything
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 2' }));
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(all);
    expect(selectedCount(2)).toBeInTheDocument();
  });

  it('drops selections for rows that disappear and keeps them across a same-row refresh', () => {
    const { rerender, props } = renderResult();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    expect(selectedCount(1)).toBeInTheDocument();
    rerender(<DiffResult {...props} data={[...data]} />);
    expect(selectedCount(1)).toBeInTheDocument();
    rerender(<DiffResult {...props} data={[data[1]]} />);
    expect(screen.getByText('Found 1 differences • 0 selected')).toBeInTheDocument();
  });
});

describe('DiffResult — column filter', () => {
  it('hides unchecked columns from the expanded diff and tracks the visible count', async () => {
    renderResult();
    fireEvent.click(expandButton(bodyRows()[0]));
    expect(screen.getByText('a')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Columns \(2\/2\)/ }));
    const nameToggle = await screen.findByLabelText('NAME');
    fireEvent.click(nameToggle);
    expect(screen.getByRole('button', { name: /Columns \(1\/2\)/ })).toBeInTheDocument();
    expect(screen.queryByText('a')).toBeNull();
    // the long-text NOTE card is still listed
    expect(screen.getByText('Deep Review')).toBeInTheDocument();

    fireEvent.click(nameToggle);
    expect(screen.getByRole('button', { name: /Columns \(2\/2\)/ })).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('newly arriving columns become visible automatically', () => {
    const { rerender, props } = renderResult();
    const extra: CompareJobDiffRow = {
      ...data[1],
      changes: [...data[1].changes, { column: 'DEPT', sourceValue: 'x', targetValue: 'y', isLongText: false }],
    };
    rerender(<DiffResult {...props} data={[data[0], extra]} />);
    expect(screen.getByRole('button', { name: /Columns \(3\/3\)/ })).toBeInTheDocument();
  });
});
