import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { getCompareConfig } = vi.hoisted(() => ({ getCompareConfig: vi.fn() }));
vi.mock('../services/api', () => ({ default: { getCompareConfig } }));

import { CompareJob } from './CompareJob';

const pairs = [
  { pairName: 'accounts', db: 'X', tableA: 'S.SRC_ACC', tableB: 'S.TGT_ACC', pkColumns: ['ID'], excludeColumns: ['UPDATED_AT'], validation: null },
  { pairName: 'orders', db: 'X', tableA: 'S.SRC_ORD', tableB: 'S.TGT_ORD', pkColumns: ['ID', 'SEQ'], excludeColumns: [], validation: null },
];

beforeEach(() => {
  getCompareConfig.mockReset();
  getCompareConfig.mockResolvedValue(pairs);
});

/** The form's text inputs in DOM order: Table One, Table Two, Sync PK, Ignore Column (PK filters come after). */
function fields(container: HTMLElement) {
  const text = container.querySelectorAll<HTMLInputElement>('input[type="text"]');
  return {
    tableOne: text[0], tableTwo: text[1], syncPk: text[2], ignoreColumn: text[3],
    limit: container.querySelector<HTMLInputElement>('input[type="number"]')!,
  };
}
const runButton = () => screen.getByRole('button', { name: /Run Comparison/ });
const pairsCounter = () => screen.getByText(/Configured pairs:/);

async function renderLoaded() {
  const onStartReview = vi.fn();
  const onConfigChange = vi.fn();
  const utils = render(<CompareJob onStartReview={onStartReview} onConfigChange={onConfigChange} />);
  await waitFor(() => expect(fields(utils.container).tableOne).toHaveValue('S.SRC_ACC'));
  return { ...utils, onStartReview, onConfigChange };
}

describe('CompareJob — configured pairs', () => {
  it('shows a loading state until the pairs arrive, then pre-fills the first pair', async () => {
    let resolve!: (value: unknown) => void;
    getCompareConfig.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { container } = render(<CompareJob onStartReview={vi.fn()} />);

    expect(pairsCounter()).toHaveTextContent('Configured pairs: Loading');
    expect(screen.getByText('Loading config')).toBeInTheDocument();
    expect(runButton()).toBeDisabled();

    resolve(pairs);
    await waitFor(() => expect(fields(container).tableOne).toHaveValue('S.SRC_ACC'));
    expect(pairsCounter()).toHaveTextContent('Configured pairs: 2');
    expect(screen.getByText('2 configured')).toBeInTheDocument();
    expect(fields(container).tableTwo).toHaveValue('S.TGT_ACC');
    expect(fields(container).syncPk).toHaveValue('ID');
    expect(fields(container).ignoreColumn).toHaveValue('UPDATED_AT');
    expect(screen.getByText('Ignored during diff display; still copied on approve.')).toBeInTheDocument();
    expect(runButton()).toBeEnabled();
  });

  it('falls back to manual mode when the config API fails', async () => {
    getCompareConfig.mockRejectedValue(new Error('no config'));
    const { container } = render(<CompareJob onStartReview={vi.fn()} onConfigChange={vi.fn()} />);
    await waitFor(() => expect(pairsCounter()).toHaveTextContent('Configured pairs: 0'));
    expect(screen.queryByText('Selected Pair')).toBeNull();
    expect(fields(container).tableOne).toHaveValue('');
    expect(runButton()).toBeDisabled();
  });

  it('choosing another configured pair applies its tables, PKs and ignore list', async () => {
    const user = userEvent.setup();
    const { container } = await renderLoaded();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'orders' }));
    await waitFor(() => expect(fields(container).tableOne).toHaveValue('S.SRC_ORD'));
    expect(fields(container).tableTwo).toHaveValue('S.TGT_ORD');
    expect(fields(container).syncPk).toHaveValue('ID, SEQ');
    expect(fields(container).ignoreColumn).toHaveValue('');
    expect(screen.queryByText('Ignored during diff display; still copied on approve.')).toBeNull();
    expect(screen.getAllByPlaceholderText('any')).toHaveLength(2);
  });
});

describe('CompareJob — running', () => {
  it('Run is enabled only once source, target and Sync PK are all present (manual mode)', async () => {
    getCompareConfig.mockResolvedValue([]);
    const { container } = render(<CompareJob onStartReview={vi.fn()} />);
    await waitFor(() => expect(pairsCounter()).toHaveTextContent('Configured pairs: 0'));
    const f = fields(container);
    fireEvent.change(f.tableOne, { target: { value: 'A.T1' } });
    expect(runButton()).toBeDisabled();
    fireEvent.change(f.tableTwo, { target: { value: 'A.T2' } });
    expect(runButton()).toBeDisabled();
    fireEvent.change(f.syncPk, { target: { value: 'id' } });
    expect(runButton()).toBeEnabled();
  });

  it('Run sends the parsed config; PK filters are included only when filled', async () => {
    const { onStartReview } = await renderLoaded();
    fireEvent.click(runButton());
    expect(onStartReview).toHaveBeenLastCalledWith({
      tableOne: 'S.SRC_ACC', tableTwo: 'S.TGT_ACC', syncPk: ['ID'], ignoreColumns: ['UPDATED_AT'], limit: 100,
    });

    // one filter input per PK column; blank = wildcard, so no pkFilter key
    expect(screen.queryByText('clear')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('any'), { target: { value: '42' } });
    expect(screen.getByText('clear')).toBeInTheDocument();
    fireEvent.click(runButton());
    expect(onStartReview).toHaveBeenLastCalledWith(expect.objectContaining({ pkFilter: { ID: '42' } }));

    // whitespace-only filters are dropped
    fireEvent.change(screen.getByPlaceholderText('any'), { target: { value: '   ' } });
    expect(screen.queryByText('clear')).toBeNull();
    fireEvent.click(runButton());
    expect(onStartReview.mock.calls[2][0]).not.toHaveProperty('pkFilter');

    // clear resets every filter
    fireEvent.change(screen.getByPlaceholderText('any'), { target: { value: '7' } });
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByPlaceholderText('any')).toHaveValue('');
    fireEvent.click(runButton());
    expect(onStartReview.mock.calls[3][0]).not.toHaveProperty('pkFilter');
  });

  it('editing Sync PK re-derives the filter inputs (upper-cased labels) and drops stale filters', async () => {
    const { container, onStartReview } = await renderLoaded();
    fireEvent.change(screen.getByPlaceholderText('any'), { target: { value: '42' } });
    fireEvent.change(fields(container).syncPk, { target: { value: 'id, seq' } });

    const filters = screen.getAllByPlaceholderText('any');
    expect(filters).toHaveLength(2);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('SEQ')).toBeInTheDocument();
    filters.forEach((f) => expect(f).toHaveValue(''));

    fireEvent.click(runButton());
    expect(onStartReview).toHaveBeenLastCalledWith(expect.objectContaining({ syncPk: ['id', 'seq'] }));
    expect(onStartReview.mock.calls[0][0]).not.toHaveProperty('pkFilter');

    // no PK → no filter section, and Run is blocked
    fireEvent.change(fields(container).syncPk, { target: { value: '' } });
    expect(screen.queryByText('PK Filter')).toBeNull();
    expect(runButton()).toBeDisabled();
  });

  it('Limit accepts numbers and falls back to 100 for non-numeric input', async () => {
    const { container, onStartReview } = await renderLoaded();
    fireEvent.change(fields(container).limit, { target: { value: '250' } });
    fireEvent.click(runButton());
    expect(onStartReview).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 250 }));
    fireEvent.change(fields(container).limit, { target: { value: '' } });
    expect(fields(container).limit).toHaveValue(100);
    fireEvent.click(runButton());
    expect(onStartReview).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100 }));
  });
});

describe('CompareJob — swap direction', () => {
  it('reverses source/target and tells the parent the config changed', async () => {
    const { container, onConfigChange } = await renderLoaded();
    fireEvent.click(screen.getByTitle('Reverse Sync Direction'));
    expect(fields(container).tableOne).toHaveValue('S.TGT_ACC');
    expect(fields(container).tableTwo).toHaveValue('S.SRC_ACC');
    expect(onConfigChange).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a blank form', async () => {
    getCompareConfig.mockResolvedValue([]);
    const onConfigChange = vi.fn();
    render(<CompareJob onStartReview={vi.fn()} onConfigChange={onConfigChange} />);
    await waitFor(() => expect(pairsCounter()).toHaveTextContent('Configured pairs: 0'));
    fireEvent.click(screen.getByTitle('Reverse Sync Direction'));
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it('works without an onConfigChange listener', async () => {
    const { container } = render(<CompareJob onStartReview={vi.fn()} />);
    await waitFor(() => expect(fields(container).tableOne).toHaveValue('S.SRC_ACC'));
    fireEvent.click(screen.getByTitle('Reverse Sync Direction'));
    expect(fields(container).tableOne).toHaveValue('S.TGT_ACC');
    expect(fields(container).tableTwo).toHaveValue('S.SRC_ACC');
  });
});
