import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

describe('TableSelector', () => {
  it('renders the table picker and loads tables on mount', async () => {
    render(<TableSelector onQuery={vi.fn()} />);
    expect(screen.getByText('Select a table')).toBeInTheDocument();
    await waitFor(() => expect(listTables).toHaveBeenCalled());
  });

  it('survives a listTables failure (logged, not thrown)', async () => {
    listTables.mockRejectedValue(new Error('boom'));
    const { container } = render(<TableSelector onQuery={vi.fn()} />);
    await waitFor(() => expect(listTables).toHaveBeenCalled());
    expect(container.firstChild).toBeTruthy();
  });
});
