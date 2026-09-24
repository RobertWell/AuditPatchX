import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { listTables } = vi.hoisted(() => ({ listTables: vi.fn() }));
vi.mock('../services/api', () => ({ default: { listTables } }));

import { TableSelector } from './TableSelector';

beforeEach(() => {
  listTables.mockReset();
  listTables.mockResolvedValue([
    { schema: 'S', table: 'ACCOUNTS', pkColumns: ['ID'] },
    { schema: 'S', table: 'ORDERS', pkColumns: ['ID', 'SEQ'] },
  ]);
});

/** Open the antd Select (it opens on mousedown) and pick the option carrying `label`. */
async function pickTable(container: HTMLElement, label: string) {
  await waitFor(() => expect(listTables).toHaveBeenCalled());
  fireEvent.mouseDown(container.querySelector('.ant-select-selector')!);
  // options render in a body-level portal; each option label is the only div inside its content
  const option = await screen.findByText(label, { selector: '.ant-select-item-option-content div' });
  fireEvent.click(option);
}

const fetchButton = () => screen.getByRole('button', { name: /FETCH/ });

describe('TableSelector', () => {
  it('renders the table picker and loads tables on mount', async () => {
    render(<TableSelector onQuery={vi.fn()} />);
    expect(screen.getByText('Select a table')).toBeInTheDocument();
    await waitFor(() => expect(listTables).toHaveBeenCalled());
    // nothing to key on until a table is chosen
    expect(screen.queryByText('Primary Key')).toBeNull();
  });

  it('survives a listTables failure (logged, not thrown)', async () => {
    listTables.mockRejectedValue(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<TableSelector onQuery={vi.fn()} />);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to load tables:', expect.any(Error)));
    // still usable: the picker is rendered, just empty
    expect(screen.getByText('Select a table')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('selecting a table reveals one input per PK column and gates FETCH until all are filled', async () => {
    const onQuery = vi.fn();
    const { container } = render(<TableSelector onQuery={onQuery} />);
    await pickTable(container, 'S.ORDERS');

    expect(screen.getByText('Primary Key')).toBeInTheDocument();
    const id = screen.getByPlaceholderText('ID');
    const seq = screen.getByPlaceholderText('SEQ');
    expect(fetchButton()).toBeDisabled();

    fireEvent.change(id, { target: { value: '1' } });
    expect(fetchButton()).toBeDisabled();
    fireEvent.change(seq, { target: { value: '2' } });
    expect(fetchButton()).toBeEnabled();

    fireEvent.click(fetchButton());
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(onQuery).toHaveBeenCalledWith('S', 'ORDERS', { ID: '1', SEQ: '2' });
  });

  it('a single-PK table only asks for that key', async () => {
    const onQuery = vi.fn();
    const { container } = render(<TableSelector onQuery={onQuery} />);
    await pickTable(container, 'S.ACCOUNTS');
    expect(screen.getByPlaceholderText('ID')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('SEQ')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('ID'), { target: { value: '42' } });
    fireEvent.click(fetchButton());
    expect(onQuery).toHaveBeenCalledWith('S', 'ACCOUNTS', { ID: '42' });
  });

  it('switching tables clears the previously typed PK values', async () => {
    const { container } = render(<TableSelector onQuery={vi.fn()} />);
    await pickTable(container, 'S.ACCOUNTS');
    fireEvent.change(screen.getByPlaceholderText('ID'), { target: { value: '7' } });
    expect(fetchButton()).toBeEnabled();

    await pickTable(container, 'S.ORDERS');
    expect(screen.getByPlaceholderText('ID')).toHaveValue('');
    expect(screen.getByPlaceholderText('SEQ')).toHaveValue('');
    expect(fetchButton()).toBeDisabled();
  });
});
