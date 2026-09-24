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

  it('the record handed to onRowClick carries the _rowKey that highlights that row', async () => {
    // App stores this key as selectedRowKey; before 2026-09-24 it stored JSON.stringify(row), which
    // never equals JSON(row)+index, so no clicked row was ever highlighted.
    const onRowClick = vi.fn();
    const { container, rerender } = render(<DataGrid data={data} columns={columns} onRowClick={onRowClick} />);
    await userEvent.click(screen.getAllByText('alpha')[0]);
    const record = onRowClick.mock.calls[0][0];
    expect(record._rowKey).toBe(JSON.stringify(data[0]) + '0');
    rerender(<DataGrid data={data} columns={columns} onRowClick={onRowClick} selectedRowKey={record._rowKey} />);
    expect(container.querySelector('tr.bg-blue-50')).not.toBeNull();
    rerender(<DataGrid data={data} columns={columns} onRowClick={onRowClick} selectedRowKey={JSON.stringify(data[0])} />);
    expect(container.querySelector('tr.bg-blue-50')).toBeNull();
  });

  it('highlights the selected row in the light and dark palettes', () => {
    // row keys are JSON(row) + index, so App's selectedRowKey must match exactly
    const key = JSON.stringify(data[0]) + '0';
    const { container, rerender } = render(<DataGrid data={data} columns={columns} selectedRowKey={key} />);
    expect(container.querySelector('tr.bg-blue-50')).not.toBeNull();
    expect(container.querySelectorAll('tr.cursor-pointer')).toHaveLength(1);

    rerender(<DataGrid data={data} columns={columns} selectedRowKey={key} themeMode={ThemeMode.Dark} />);
    expect(container.querySelector('tr.bg-blue-50')).toBeNull();
    expect(container.querySelector('tr[class*="bg-blue-950/40"]')).not.toBeNull();
    expect(container.querySelectorAll('tr.cursor-pointer')).toHaveLength(1);
  });
});
