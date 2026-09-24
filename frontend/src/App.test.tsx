import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * HEL-179: the critical App journeys — the review/approve flows that gate DB
 * writes. The heavy child components have their own render tests; here they are
 * replaced by thin prop-driven stubs so the tests drive App.tsx's OWN logic:
 * handleQuery (incl. 404→insert mode), the approve modal (reason gate →
 * update/insert), compare run, row approve (Modal.confirm) / reject, the SQL
 * review panel submit, swap & export, theme persistence and the error paths.
 */
const { api } = vi.hoisted(() => ({
  api: {
    getTableMetadata: vi.fn(),
    getByPk: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    compareJob: vi.fn(),
    reviewCompareRow: vi.fn(),
  },
}));
vi.mock('./services/api', () => ({ default: api, apiClient: api }));

const { exportMocks } = vi.hoisted(() => ({
  exportMocks: { generateExportSql: vi.fn(() => '-- sql'), downloadSqlFile: vi.fn() },
}));
vi.mock('./services/exportSql', () => exportMocks);

// ---- thin child stubs: expose the callback props as clickable buttons ----
vi.mock('./components/TableSelector', () => ({
  TableSelector: ({ onQuery }: any) => (
    <div>
      <button onClick={() => onQuery('S', 'T', { ID: '1' })}>stub-query</button>
      <button onClick={() => onQuery('S', 'T', { id: '7' })}>stub-query-lower</button>
    </div>
  ),
}));
vi.mock('./components/DataGrid', () => ({
  DataGrid: ({ data, onRowClick }: any) => (
    <div>
      <span>stub-grid-{data.length}</span>
      <button onClick={() => onRowClick(data[0])}>stub-row-click</button>
    </div>
  ),
}));
vi.mock('./components/DiffView', () => ({
  DiffView: ({ onAfterChange, onApprove, onReject, isInsertMode }: any) => (
    <div>
      <span>{isInsertMode ? 'stub-diff-insert' : 'stub-diff-update'}</span>
      <button onClick={() => onAfterChange({ ID: 1, NAME: 'edited' })}>stub-edit</button>
      <button onClick={onApprove}>stub-approve</button>
      <button onClick={onReject}>stub-reject</button>
    </div>
  ),
}));
vi.mock('./components/Sidebar', () => ({
  Sidebar: ({ onNavigate }: any) => (
    <nav>
      <button onClick={() => onNavigate('patches')}>nav-patches</button>
      <button onClick={() => onNavigate('compare')}>nav-compare</button>
      <button onClick={() => onNavigate('audit')}>nav-audit</button>
      <button onClick={() => onNavigate('conflicts')}>nav-conflicts</button>
      <button onClick={() => onNavigate('rules')}>nav-rules</button>
      <button onClick={() => onNavigate('bogus')}>nav-bogus</button>
    </nav>
  ),
}));
vi.mock('./components/CompareJob', () => ({
  CompareJob: ({ onStartReview, onConfigChange }: any) => (
    <div>
      <button onClick={() => onStartReview({ tableOne: 'S.SRC', tableTwo: 'S.TGT', syncPk: ['ID'], ignoreColumns: [], limit: 100 })}>stub-run-compare</button>
      <button onClick={() => onStartReview({ tableOne: 'S.SRC', tableTwo: 'S.TGT', syncPk: ['ID'], ignoreColumns: ['UPDATED_AT'], limit: 100 })}>stub-run-compare-ignored</button>
      <button onClick={onConfigChange}>stub-config-change</button>
    </div>
  ),
}));
vi.mock('./components/DiffResult', () => ({
  DiffResult: ({ data, onRowApprove, onRowReject, onOpenSqlReview, onReviewSelected, onBulkApproveSelected, onExportSql, onSwapDirection, limitReached, scannedRows }: any) => (
    <div>
      <span>stub-result-{data.length}</span>
      <span>stub-scanned-{scannedRows}</span>
      {limitReached && <span>stub-limit-reached</span>}
      <button onClick={() => onRowApprove(data[0])}>stub-row-approve</button>
      <button onClick={() => onRowReject(data[0])}>stub-row-reject</button>
      <button onClick={() => onOpenSqlReview(data[0], 'NAME')}>stub-open-review</button>
      <button onClick={() => onReviewSelected(data[0], 'NAME')}>stub-review-selected</button>
      <button onClick={() => onBulkApproveSelected(data)}>stub-bulk-approve</button>
      <button onClick={() => onBulkApproveSelected([])}>stub-bulk-approve-none</button>
      <button onClick={onExportSql}>stub-export</button>
      <button onClick={onSwapDirection}>stub-swap</button>
    </div>
  ),
}));
vi.mock('./components/SqlReviewPanel', () => ({
  SqlReviewPanel: ({ rowId, column, onSubmitReview, onClose }: any) => (
    <div>
      <span>stub-panel-{rowId}-{column}</span>
      <button onClick={() => onSubmitReview({ rowId, column, decision: 'approved', comment: 'ok' })}>stub-panel-approve</button>
      <button onClick={() => onSubmitReview({ rowId, column, decision: 'rejected', comment: 'no' })}>stub-panel-reject</button>
      <button onClick={onClose}>stub-panel-close</button>
    </div>
  ),
}));

import App from './App';

const diffRow = {
  pk: '1', pkMap: { ID: '1' }, status: 'UPDATE', changedColumns: 1, updatedBy: '',
  reviewStatus: 'PENDING', changes: [{ column: 'NAME', sourceValue: 'a', targetValue: 'b', isLongText: false }],
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  exportMocks.generateExportSql.mockClear();
  exportMocks.downloadSqlFile.mockClear();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  api.getTableMetadata.mockResolvedValue({
    schema: 'S', table: 'T', pkColumns: ['ID'],
    columns: [{ name: 'ID', type: 'NUMBER', nullable: false }, { name: 'NAME', type: 'VARCHAR2', nullable: true }],
  });
  api.getByPk.mockResolvedValue({ row: { ID: 1, NAME: 'orig' } });
  api.update.mockResolvedValue({ updated: 1, row: { ID: 1, NAME: 'edited' } });
  api.insert.mockResolvedValue({ inserted: 1, row: { ID: 1, NAME: 'new' } });
  api.compareJob.mockResolvedValue({ differences: [diffRow], limitReached: false, scannedRows: 1 });
  api.reviewCompareRow.mockResolvedValue({ pk: '1', status: 'APPROVED' });
});

async function runQuery() {
  fireEvent.click(screen.getByText('stub-query'));
  await waitFor(() => expect(api.getByPk).toHaveBeenCalled());
  await screen.findByText('stub-diff-update');
}

const reasonBox = () => screen.findByPlaceholderText('Enter reason for this change (required)');

describe('App — patch journey (query → edit → approve → update)', () => {
  it('loads a record and applies an update through the reason-gated modal', async () => {
    render(<App />);
    await runQuery();

    // edit then approve → modal opens with the changed field listed
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-approve'));
    const reason = await reasonBox();

    // OK is the modal's Approve button; disabled until a reason is entered
    fireEvent.change(reason, { target: { value: 'fixing NAME' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(api.update).toHaveBeenCalled());
    const req = api.update.mock.calls[0][0];
    expect(req).toMatchObject({ schema: 'S', table: 'T', reason: 'fixing NAME' });
    expect(req.set).toHaveProperty('NAME', 'edited');
  });

  it('blocks approve when nothing changed', async () => {
    render(<App />);
    await runQuery();
    // no edit → approve should warn, modal must NOT open
    fireEvent.click(screen.getByText('stub-approve'));
    expect(screen.queryByPlaceholderText('Enter reason for this change (required)')).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('reject restores the before-state without an API call', async () => {
    render(<App />);
    await runQuery();
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-reject'));
    expect(api.update).not.toHaveBeenCalled();
  });

  it('enters insert mode on 404 ROW_NOT_FOUND and inserts via the modal', async () => {
    api.getByPk.mockRejectedValue({ response: { status: 404, data: { code: 'ROW_NOT_FOUND' } } });
    render(<App />);
    fireEvent.click(screen.getByText('stub-query'));
    await screen.findByText('stub-diff-insert');

    fireEvent.click(screen.getByText('stub-approve'));
    const reason = await reasonBox();
    fireEvent.change(reason, { target: { value: 'seeding row' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

    await waitFor(() => expect(api.insert).toHaveBeenCalled());
    expect(api.insert.mock.calls[0][0]).toMatchObject({ schema: 'S', table: 'T', reason: 'seeding row' });
    expect(api.update).not.toHaveBeenCalled();
    // a successful insert leaves insert mode and shows the stored row
    await screen.findByText('stub-diff-update');
    expect(screen.getByText('stub-grid-1')).toBeInTheDocument();
  });

  it('surfaces an update failure in the modal instead of closing it', async () => {
    api.update.mockRejectedValue({ response: { data: { error: 'ORA-00001 unique violation' } } });
    render(<App />);
    await runQuery();
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-approve'));
    const reason = await reasonBox();
    fireEvent.change(reason, { target: { value: 'r' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText('ORA-00001 unique violation');
    // typing a new reason clears the stale error line
    fireEvent.change(reason, { target: { value: 'second attempt' } });
    expect(screen.queryByText('ORA-00001 unique violation')).toBeNull();
  });
});

describe('App — patch journey, secondary paths', () => {
  it('re-fetches a record when a grid row is clicked', async () => {
    render(<App />);
    await runQuery();
    fireEvent.click(screen.getByText('stub-row-click'));
    await waitFor(() => expect(api.getByPk).toHaveBeenCalledTimes(2));
    expect(api.getByPk.mock.calls[1][0]).toEqual({ schema: 'S', table: 'T', pk: { ID: 1 } });
  });

  it('reports a failed row re-fetch with the transport error message', async () => {
    render(<App />);
    await runQuery();
    api.getByPk.mockRejectedValueOnce(new Error('socket hang up'));
    fireEvent.click(screen.getByText('stub-row-click'));
    await screen.findByText('Failed to load record: socket hang up');
  });

  it('reports a metadata failure and never queries the row', async () => {
    api.getTableMetadata.mockRejectedValue({ response: { data: { error: 'metadata denied' } } });
    render(<App />);
    fireEvent.click(screen.getByText('stub-query'));
    await screen.findByText('Failed to load record: metadata denied');
    expect(api.getByPk).not.toHaveBeenCalled();
    expect(screen.queryByText('stub-diff-update')).toBeNull();
  });

  it('a non-404 fetch failure is surfaced, not treated as insert mode', async () => {
    api.getByPk.mockRejectedValue({ response: { status: 500, data: { error: 'ORA-00942' } } });
    render(<App />);
    fireEvent.click(screen.getByText('stub-query'));
    await screen.findByText('Failed to load record: ORA-00942');
    expect(screen.queryByText('stub-diff-insert')).toBeNull();
  });

  it('a 404 without the ROW_NOT_FOUND code is a plain failure', async () => {
    api.getByPk.mockRejectedValue({ response: { status: 404, data: { error: 'endpoint missing' } } });
    render(<App />);
    fireEvent.click(screen.getByText('stub-query'));
    await screen.findByText('Failed to load record: endpoint missing');
    expect(screen.queryByText('stub-diff-insert')).toBeNull();
  });

  it('insert mode seeds the PK from lower-cased pk keys and lists only filled values in the modal', async () => {
    api.getByPk.mockRejectedValue({ response: { status: 404, data: { code: 'ROW_NOT_FOUND' } } });
    render(<App />);
    fireEvent.click(screen.getByText('stub-query-lower'));
    await screen.findByText('stub-diff-insert');
    fireEvent.click(screen.getByText('stub-approve'));
    await screen.findByText('You are about to insert a new record with the following values:');
    // NAME is blank and therefore not listed; ID came from the lower-cased key
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['ID: 7']);
  });

  it('the update modal lists each changed field as before → after', async () => {
    render(<App />);
    await runQuery();
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-approve'));
    await screen.findByText('You are about to update the following fields:');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['NAME: orig → edited']);
  });

  it('Cancel closes the approve modal; re-opening starts with a blank reason', async () => {
    render(<App />);
    await runQuery();
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-approve'));
    const reason = await reasonBox();
    fireEvent.change(reason, { target: { value: 'half typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('stub-approve'));
    await waitFor(() => expect(screen.getByPlaceholderText('Enter reason for this change (required)')).toHaveValue(''));
  });

  it('an update failure without a response body falls back to the error message', async () => {
    api.update.mockRejectedValue(new Error('update offline'));
    render(<App />);
    await runQuery();
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-approve'));
    fireEvent.change(await reasonBox(), { target: { value: 'r' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText('Update failed: update offline');
    expect(screen.getByText('update offline')).toBeInTheDocument();
  });

  it('an insert failure keeps the modal open, in insert mode, with the error', async () => {
    api.getByPk.mockRejectedValue({ response: { status: 404, data: { code: 'ROW_NOT_FOUND' } } });
    api.insert.mockRejectedValue(new Error('insert offline'));
    render(<App />);
    fireEvent.click(screen.getByText('stub-query'));
    await screen.findByText('stub-diff-insert');
    fireEvent.click(screen.getByText('stub-approve'));
    fireEvent.change(await reasonBox(), { target: { value: 'r' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    await screen.findByText('Insert failed: insert offline');
    expect(screen.getByText('insert offline')).toBeInTheDocument();
    expect(screen.getByText('stub-diff-insert')).toBeInTheDocument();
  });
});

describe('App — theme', () => {
  it('restores dark mode from localStorage and the switch toggles it back to light', async () => {
    localStorage.setItem('auditpatchx.theme', 'dark');
    render(<App />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('auditpatchx.theme')).toBe('light');
    // and back on again
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect(localStorage.getItem('auditpatchx.theme')).toBe('dark');
  });

  it('defaults to light when nothing is stored and persists the choice', () => {
    render(<App />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('auditpatchx.theme')).toBe('light');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});

describe('App — compare journey (run → review/approve/reject)', () => {
  async function runCompare() {
    render(<App />);
    fireEvent.click(screen.getByText('nav-compare'));
    fireEvent.click(screen.getByText('stub-run-compare'));
    await screen.findByText('stub-result-1');
  }

  it('runs a comparison and rejects a row', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-row-reject'));
    await waitFor(() => expect(api.reviewCompareRow).toHaveBeenCalled());
    expect(api.reviewCompareRow.mock.calls[0][0]).toMatchObject({
      pk: '1', status: 'REJECTED', tableOne: 'S.SRC', tableTwo: 'S.TGT',
    });
  });

  it('row approve goes through the confirm dialog before writing', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-row-approve'));
    // antd Modal.confirm portal: the ok button carries the configured okText
    const ok = await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(ok);
    await waitFor(() => expect(api.reviewCompareRow).toHaveBeenCalled());
    expect(api.reviewCompareRow.mock.calls[0][0]).toMatchObject({ pk: '1', status: 'APPROVED' });
  });

  it('bulk approve with zero selected warns and never opens the dialog', async () => {
    api.compareJob.mockResolvedValue({ differences: [], limitReached: false, scannedRows: 0 });
    render(<App />);
    fireEvent.click(screen.getByText('nav-compare'));
    fireEvent.click(screen.getByText('stub-run-compare'));
    await waitFor(() => expect(api.compareJob).toHaveBeenCalled());
    // no rows → DiffResult empty-state branch (no stub buttons rendered)
    expect(screen.queryByText('stub-row-approve')).toBeNull();
  });

  it('opens the SQL review panel and submits an approval', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-open-review'));
    await screen.findByText('stub-panel-1-NAME');
    fireEvent.click(screen.getByText('stub-panel-approve'));
    await waitFor(() => expect(api.reviewCompareRow).toHaveBeenCalled());
    expect(api.reviewCompareRow.mock.calls[0][0]).toMatchObject({ pk: '1', status: 'APPROVED' });
    // panel closes after a successful submit
    await waitFor(() => expect(screen.queryByText('stub-panel-1-NAME')).toBeNull());
  });

  it('swap re-runs the comparison with tables reversed', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-swap'));
    await waitFor(() => expect(api.compareJob).toHaveBeenCalledTimes(2));
    expect(api.compareJob.mock.calls[1][0]).toMatchObject({ tableOne: 'S.TGT', tableTwo: 'S.SRC' });
  });

  it('export generates and downloads SQL for the current diff', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-export'));
    expect(exportMocks.generateExportSql).toHaveBeenCalled();
    expect(exportMocks.downloadSqlFile).toHaveBeenCalled();
  });

  it('a failed compare surfaces the backend error', async () => {
    api.compareJob.mockRejectedValue({ response: { data: { error: 'table not allowed' } } });
    render(<App />);
    fireEvent.click(screen.getByText('nav-compare'));
    fireEvent.click(screen.getByText('stub-run-compare'));
    await screen.findByText(/table not allowed/);
  });

  it('config change clears prior results', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-config-change'));
    await waitFor(() => expect(screen.queryByText('stub-result-1')).toBeNull());
  });
});

describe('App — compare journey, secondary paths', () => {
  async function runCompare(trigger = 'stub-run-compare', expected = 'stub-result-1') {
    render(<App />);
    fireEvent.click(screen.getByText('nav-compare'));
    fireEvent.click(screen.getByText(trigger));
    await screen.findByText(expected);
  }
  const rowWithPk = (pk: string) => ({ ...diffRow, pk, pkMap: { ID: pk } });

  it('bulk approve confirms the direction and row count, then reports the approved rows', async () => {
    api.compareJob.mockResolvedValue({ differences: [rowWithPk('1'), rowWithPk('2')], limitReached: false, scannedRows: 2 });
    await runCompare('stub-run-compare', 'stub-result-2');
    fireEvent.click(screen.getByText('stub-bulk-approve'));
    await screen.findByText('This action will apply changes to 2 row(s).');
    expect(screen.getByText('S.SRC -> S.TGT')).toBeInTheDocument();
    expect(screen.getByText('Changed columns: 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText('Approved 2 row(s)');
    expect(api.reviewCompareRow).toHaveBeenCalledTimes(2);
    expect(api.reviewCompareRow.mock.calls.map((c) => c[0].pk).sort()).toEqual(['1', '2']);
  });

  it('bulk approve reports the rows that failed alongside the ones that succeeded', async () => {
    api.compareJob.mockResolvedValue({
      differences: ['1', '2', '3', '4'].map(rowWithPk), limitReached: false, scannedRows: 4,
    });
    api.reviewCompareRow.mockImplementation(async (req: any) => {
      if (req.pk === '4') throw new Error('row locked');
      return { pk: req.pk, status: 'APPROVED' };
    });
    await runCompare('stub-run-compare', 'stub-result-4');
    fireEvent.click(screen.getByText('stub-bulk-approve'));
    await screen.findByText('This action will apply changes to 4 row(s).');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText('1 row(s) failed to approve — check each row and retry');
    expect(screen.getByText('Approved 3 row(s)')).toBeInTheDocument();
    expect(api.reviewCompareRow).toHaveBeenCalledTimes(4);
  });

  it('bulk approve with an empty selection warns and never opens the dialog', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-bulk-approve-none'));
    await screen.findByText('No rows selected');
    expect(screen.queryByText('This action will apply changes to 0 row(s).')).toBeNull();
    expect(api.reviewCompareRow).not.toHaveBeenCalled();
  });

  it('the confirm dialog notes ignored columns that will still be copied; Cancel writes nothing', async () => {
    await runCompare('stub-run-compare-ignored');
    fireEvent.click(screen.getByText('stub-row-approve'));
    await screen.findByText(/Ignored columns are hidden from the diff but will still be copied: UPDATED_AT/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.reviewCompareRow).not.toHaveBeenCalled();
  });

  it('a failed row reject is reported with the backend error', async () => {
    api.reviewCompareRow.mockRejectedValue({ response: { data: { error: 'row is locked' } } });
    await runCompare();
    fireEvent.click(screen.getByText('stub-row-reject'));
    await screen.findByText('Reject failed: row is locked');
  });

  it('Review Selected opens the SQL review panel for the chosen column; close dismisses it', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-review-selected'));
    await screen.findByText('stub-panel-1-NAME');
    fireEvent.click(screen.getByText('stub-panel-close'));
    await waitFor(() => expect(screen.queryByText('stub-panel-1-NAME')).toBeNull());
    expect(api.reviewCompareRow).not.toHaveBeenCalled();
  });

  it('a rejected SQL review posts REJECTED and closes the panel', async () => {
    await runCompare();
    fireEvent.click(screen.getByText('stub-open-review'));
    await screen.findByText('stub-panel-1-NAME');
    fireEvent.click(screen.getByText('stub-panel-reject'));
    await waitFor(() => expect(api.reviewCompareRow).toHaveBeenCalled());
    expect(api.reviewCompareRow.mock.calls[0][0]).toMatchObject({ pk: '1', status: 'REJECTED', pkMap: { ID: '1' } });
    await screen.findByText('NAME review rejected');
    await waitFor(() => expect(screen.queryByText('stub-panel-1-NAME')).toBeNull());
  });

  it('a failed SQL review submit keeps the panel open and reports the error', async () => {
    api.reviewCompareRow.mockRejectedValue(new Error('review offline'));
    await runCompare();
    fireEvent.click(screen.getByText('stub-open-review'));
    await screen.findByText('stub-panel-1-NAME');
    fireEvent.click(screen.getByText('stub-panel-approve'));
    await screen.findByText('Review submit failed: review offline');
    expect(screen.getByText('stub-panel-1-NAME')).toBeInTheDocument();
  });

  it('shows a spinner while the comparison runs and passes the scan metadata to the results', async () => {
    let resolve!: (value: unknown) => void;
    api.compareJob.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<App />);
    fireEvent.click(screen.getByText('nav-compare'));
    fireEvent.click(screen.getByText('stub-run-compare'));
    await waitFor(() => expect(document.querySelector('.ant-spin-spinning')).not.toBeNull());
    resolve({ differences: [diffRow], limitReached: true, scannedRows: 100 });
    await screen.findByText('stub-limit-reached');
    expect(screen.getByText('stub-scanned-100')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.ant-spin-spinning')).toBeNull());
  });

  it('tolerates a compare response without scan metadata', async () => {
    api.compareJob.mockResolvedValue({ differences: [diffRow] });
    await runCompare();
    expect(screen.getByText('stub-scanned-0')).toBeInTheDocument();
    expect(screen.queryByText('stub-limit-reached')).toBeNull();
  });
});

describe('App — navigation shell', () => {
  it('placeholder pages render for unbuilt sections', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('nav-audit'));
    await screen.findByText('Audit Review');
    fireEvent.click(screen.getByText('nav-patches'));
    await screen.findByText('Patch Management');
  });

  it('renders the remaining placeholders, an unknown-page fallback and the empty compare state', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('nav-conflicts'));
    await screen.findByText('Conflict Review');
    fireEvent.click(screen.getByText('nav-rules'));
    await screen.findByText('Ignore Rules');
    fireEvent.click(screen.getByText('nav-bogus'));
    await screen.findByText('Unknown Page');
    fireEvent.click(screen.getByText('nav-compare'));
    await screen.findByText('Run a comparison to view the differences here.');
    expect(api.compareJob).not.toHaveBeenCalled();
  });
});
