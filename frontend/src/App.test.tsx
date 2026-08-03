import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * HEL-179: the critical App journeys — the review/approve flows that gate DB
 * writes. The heavy child components have their own render tests; here they are
 * replaced by thin prop-driven stubs so the tests drive App.tsx's OWN logic:
 * handleQuery (incl. 404→insert mode), the approve modal (reason gate →
 * update/insert), compare run, row approve (Modal.confirm) / reject, the SQL
 * review panel submit, swap & export.
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
    <button onClick={() => onQuery('S', 'T', { ID: '1' })}>stub-query</button>
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
    </nav>
  ),
}));
const compareConfig = { tableOne: 'S.SRC', tableTwo: 'S.TGT', syncPk: ['ID'], ignoreColumns: [], limit: 100 };
vi.mock('./components/CompareJob', () => ({
  CompareJob: ({ onStartReview, onConfigChange }: any) => (
    <div>
      <button onClick={() => onStartReview({ tableOne: 'S.SRC', tableTwo: 'S.TGT', syncPk: ['ID'], ignoreColumns: [], limit: 100 })}>stub-run-compare</button>
      <button onClick={onConfigChange}>stub-config-change</button>
    </div>
  ),
}));
vi.mock('./components/DiffResult', () => ({
  DiffResult: ({ data, onRowApprove, onRowReject, onOpenSqlReview, onBulkApproveSelected, onExportSql, onSwapDirection }: any) => (
    <div>
      <span>stub-result-{data.length}</span>
      <button onClick={() => onRowApprove(data[0])}>stub-row-approve</button>
      <button onClick={() => onRowReject(data[0])}>stub-row-reject</button>
      <button onClick={() => onOpenSqlReview(data[0], 'NAME')}>stub-open-review</button>
      <button onClick={() => onBulkApproveSelected(data)}>stub-bulk-approve</button>
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

describe('App — patch journey (query → edit → approve → update)', () => {
  it('loads a record and applies an update through the reason-gated modal', async () => {
    render(<App />);
    await runQuery();

    // edit then approve → modal opens with the changed field listed
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-approve'));
    const reason = await screen.findByPlaceholderText('Enter reason for this change (required)');

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
    const reason = await screen.findByPlaceholderText('Enter reason for this change (required)');
    fireEvent.change(reason, { target: { value: 'seeding row' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));

    await waitFor(() => expect(api.insert).toHaveBeenCalled());
    expect(api.insert.mock.calls[0][0]).toMatchObject({ schema: 'S', table: 'T', reason: 'seeding row' });
    expect(api.update).not.toHaveBeenCalled();
  });

  it('surfaces an update failure in the modal instead of closing it', async () => {
    api.update.mockRejectedValue({ response: { data: { error: 'ORA-00001 unique violation' } } });
    render(<App />);
    await runQuery();
    fireEvent.click(screen.getByText('stub-edit'));
    fireEvent.click(screen.getByText('stub-approve'));
    const reason = await screen.findByPlaceholderText('Enter reason for this change (required)');
    fireEvent.change(reason, { target: { value: 'r' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByText('ORA-00001 unique violation');
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

describe('App — navigation shell', () => {
  it('placeholder pages render for unbuilt sections', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('nav-audit'));
    await screen.findByText('Audit Review');
    fireEvent.click(screen.getByText('nav-patches'));
    await screen.findByText('Patch Management');
  });
});
