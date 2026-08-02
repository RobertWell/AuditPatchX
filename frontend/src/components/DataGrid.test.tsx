import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataGrid } from './DataGrid';
import { ThemeMode } from '../types/theme';

const columns = ['ID', 'NAME', 'META'];
const data = [
  { ID: 1, NAME: 'alpha', META: { a: 1 } },
  { ID: 2, NAME: null, META: null },
];

describe('DataGrid', () => {
  it('renders headers and scalar cell values', () => {
    render(<DataGrid data={data} columns={columns} />);
    // antd renders header text in both the th and a hidden measure cell
    expect(screen.getAllByText('ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('alpha').length).toBeGreaterThan(0);
  });

  it('renders null values as an italic "null" and objects as JSON', () => {
    render(<DataGrid data={data} columns={columns} />);
    // the null NAME cell
    expect(screen.getAllByText('null').length).toBeGreaterThan(0);
    // the object META cell is JSON-stringified
    expect(screen.getAllByText('{"a":1}').length).toBeGreaterThan(0);
  });

  it('invokes onRowClick with the record when a row is clicked', async () => {
    const onRowClick = vi.fn();
    render(<DataGrid data={data} columns={columns} onRowClick={onRowClick} themeMode={ThemeMode.Dark} />);
    await userEvent.click(screen.getAllByText('alpha')[0]);
    expect(onRowClick).toHaveBeenCalled();
    expect(onRowClick.mock.calls[0][0].NAME).toBe('alpha');
  });
});
