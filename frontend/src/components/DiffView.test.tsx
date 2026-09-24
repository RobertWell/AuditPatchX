import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, type ComponentProps } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

/**
 * Monaco cannot run under jsdom. @monaco-editor/react is replaced by a textarea
 * pair that honours the part of the DiffEditor contract DiffView relies on:
 * `original` / `modified` values and `onMount(editor)` where the modified editor
 * exposes getValue / onDidChangeModelContent and the editor exposes onDidDispose.
 * Typing into the "modified" textarea fires the content-change listeners exactly
 * as Monaco would, so DiffView's own handlers are what gets exercised.
 */
const monaco = vi.hoisted(() => ({
  value: '',
  listeners: [] as Array<() => void>,
  disposed: 0,
  onDispose: null as null | (() => void),
}));
vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  const DiffEditor = ({ original, modified, onMount, theme }: any) => {
    React.useEffect(() => {
      monaco.value = modified;
      const modifiedEditor = {
        getValue: () => monaco.value,
        onDidChangeModelContent: (cb: () => void) => {
          monaco.listeners.push(cb);
          return { dispose: () => { monaco.disposed += 1; } };
        },
      };
      onMount?.({
        getModifiedEditor: () => modifiedEditor,
        onDidDispose: (cb: () => void) => { monaco.onDispose = cb; },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="monaco-editor" data-theme={theme}>
        <textarea data-testid="monaco-original" readOnly value={original} />
        <textarea
          data-testid="monaco-modified"
          value={modified}
          onChange={(e) => { monaco.value = e.target.value; monaco.listeners.forEach((l) => l()); }}
        />
      </div>
    );
  };
  return { DiffEditor };
});

import { DiffView } from './DiffView';
import { ThemeMode } from '../types/theme';
import type { TableMetadataResponse } from '../types/api';

const metadata = {
  schema: 'S', table: 'T',
  pkColumns: ['ID'],
  columns: [
    { name: 'ID', type: 'NUMBER', nullable: false },
    { name: 'NAME', type: 'VARCHAR2', nullable: true },
    { name: 'NOTE', type: 'CLOB', nullable: true },
  ],
} as unknown as TableMetadataResponse;

const before = { ID: 1, NAME: 'alpha one', NOTE: 'a\nb' };
const after = { ID: 1, NAME: 'beta one', NOTE: 'a\nc' };

type ViewProps = ComponentProps<typeof DiffView>;

function renderView(overrides: Partial<ViewProps> = {}) {
  const props = {
    before, after, onAfterChange: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(),
    pkColumns: ['ID'], metadata, ...overrides,
  } as ViewProps;
  const utils = render(<DiffView {...props} />);
  return { ...utils, props };
}

/** Drives DiffView the way App does: every onAfterChange becomes the next `after` prop. */
function Stateful({ onAfterChange, initialAfter = after }: { onAfterChange: (a: Record<string, any>) => void; initialAfter?: Record<string, any> }) {
  const [current, setCurrent] = useState(initialAfter);
  return (
    <DiffView
      before={before} after={current} onApprove={vi.fn()} onReject={vi.fn()} pkColumns={['ID']} metadata={metadata}
      onAfterChange={(next) => { onAfterChange(next); setCurrent(next); }}
    />
  );
}

beforeEach(() => {
  monaco.value = '';
  monaco.listeners = [];
  monaco.disposed = 0;
  monaco.onDispose = null;
});

describe('DiffView — rendering and view modes', () => {
  it('side-by-side marks only the differing words/lines and counts the changes', () => {
    const { container } = renderView();
    // 'alpha one' -> 'beta one': the shared word stays neutral, only the differing word is marked
    const removedWords = container.querySelectorAll('.diff-word-removed-strong');
    const addedWords = container.querySelectorAll('.diff-word-added-strong');
    expect(removedWords).toHaveLength(1);
    expect(removedWords[0]).toHaveTextContent('alpha');
    expect(addedWords).toHaveLength(1);
    expect(addedWords[0]).toHaveTextContent('beta');

    // the multi-line NOTE is diffed line by line: 'b' leaves the before pane, 'c' enters the after pane
    const [leftPane, rightPane] = container.querySelectorAll('.diff-view');
    expect(within(leftPane as HTMLElement).getByText('b')).toHaveClass('diff-line-removed');
    expect(within(rightPane as HTMLElement).getByText('c')).toHaveClass('diff-line-added');

    expect(screen.getByText('2 changes')).toBeInTheDocument();
    expect(screen.getByText('2 fields will be updated')).toBeInTheDocument();
  });

  it('uses the singular when exactly one field changed', () => {
    renderView({ after: { ...before, NAME: 'beta one' } });
    expect(screen.getByText('1 change')).toBeInTheDocument();
    expect(screen.getByText('1 field will be updated')).toBeInTheDocument();
  });

  it('Unified tab shows a -/+ pair per changed field and a single row for unchanged ones', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Unified' }));
    const pane = screen.getByRole('tabpanel', { name: 'Unified' });
    expect(within(pane).getAllByText('-')).toHaveLength(2);
    expect(within(pane).getAllByText('+')).toHaveLength(2);
    expect(within(pane).getByText('ID')).toBeInTheDocument();
  });

  it('Summary tab lists the changed fields with before/after and names the unchanged ones', () => {
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    const pane = screen.getByRole('tabpanel', { name: 'Summary' });
    expect(within(pane).getByText('Changed Fields (2)')).toBeInTheDocument();
    expect(within(pane).getAllByText('Before:')).toHaveLength(2);
    expect(within(pane).getAllByText('After:')).toHaveLength(2);
    expect(within(pane).getByText('Unchanged Fields (1)')).toBeInTheDocument();
    expect(within(pane).getByText('ID')).toBeInTheDocument();
  });

  it('Summary reports "No changes detected" and Approve is disabled when before equals after', () => {
    const { props } = renderView({ after: { ...before } });
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(screen.getByText('No changes detected')).toBeInTheDocument();
    expect(screen.getByText('Changed Fields (0)')).toBeInTheDocument();
    expect(screen.getByText('0 fields will be updated')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: /Approve Change/ });
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(props.onApprove).not.toHaveBeenCalled();
  });

  it('Approve and Reject forward to the callbacks', () => {
    const { props } = renderView();
    fireEvent.click(screen.getByRole('button', { name: /Approve Change/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    expect(props.onApprove).toHaveBeenCalledTimes(1);
    expect(props.onReject).toHaveBeenCalledTimes(1);
  });

  it('dark theme switches the counter and summary palettes', () => {
    const { container } = renderView({ themeMode: ThemeMode.Dark });
    expect(container.querySelector('.text-green-300')).toHaveTextContent('2 changes');
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }));
    expect(container.querySelector('.text-red-300')).toHaveTextContent('Before:');
  });

  it('renders without metadata and pretty-prints object values', () => {
    renderView({ metadata: null, before: { ID: 1, J: { a: 1 } }, after: { ID: 1, J: { a: 2 } } });
    expect(screen.getAllByText(/"a": 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/"a": 2/).length).toBeGreaterThan(0);
    expect(screen.getByText('1 change')).toBeInTheDocument();
  });
});

describe('DiffView — Edit Proposed drawer', () => {
  it('opens a drawer with one field per non-PK column and saves the edited set', async () => {
    const onAfterChange = vi.fn();
    render(<Stateful onAfterChange={onAfterChange} initialAfter={{ ...after, EXTRA: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Proposed/ }));
    await screen.findByText('Edit Proposed Values');

    // ID is the PK: not editable, so only NAME, NOTE, EXTRA get a textarea; null renders as empty
    const fields = screen.getAllByRole('textbox');
    expect(fields).toHaveLength(3);
    expect(fields[0]).toHaveValue('beta one');
    expect(fields[2]).toHaveValue('');

    fireEvent.change(fields[0], { target: { value: 'gamma one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onAfterChange).toHaveBeenCalledWith({ ID: 1, NAME: 'gamma one', NOTE: 'a\nc', EXTRA: null });
    // the after pane now diffs against the saved value
    expect(screen.getByText('gamma')).toHaveClass('diff-word-added-strong');
  });

  it('Cancel discards drawer edits and restores the proposed values', async () => {
    const { props } = renderView();
    fireEvent.click(screen.getByRole('button', { name: /Edit Proposed/ }));
    await screen.findByText('Edit Proposed Values');
    const [name] = screen.getAllByRole('textbox');
    fireEvent.change(name, { target: { value: 'scratch' } });
    expect(name).toHaveValue('scratch');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onAfterChange).not.toHaveBeenCalled();
    expect(name).toHaveValue('beta one');
  });
});

describe('DiffView — inline Monaco editor', () => {
  it('double-clicking a value opens the editor seeded from before/after; typing then Save propagates', async () => {
    const onAfterChange = vi.fn();
    render(<Stateful onAfterChange={onAfterChange} />);
    fireEvent.doubleClick(screen.getByText('beta'));
    await screen.findByText('Edit NAME');

    expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-theme', 'light');
    expect(screen.getByTestId('monaco-original')).toHaveValue('alpha one');
    const modified = screen.getByTestId('monaco-modified');
    expect(modified).toHaveValue('beta one');

    fireEvent.change(modified, { target: { value: 'delta one' } });
    // the content-change subscription fed the new text back into the view state
    expect(modified).toHaveValue('delta one');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onAfterChange).toHaveBeenCalledWith({ ID: 1, NAME: 'delta one', NOTE: 'a\nc' });
    expect(screen.getByText('delta')).toHaveClass('diff-word-added-strong');
  });

  it('Cancel closes the editor without propagating; the next edit starts from the prop value again', async () => {
    const { props } = renderView();
    fireEvent.doubleClick(screen.getByText('beta'));
    await screen.findByText('Edit NAME');
    fireEvent.change(screen.getByTestId('monaco-modified'), { target: { value: 'discarded' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onAfterChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Edit NAME')).toBeNull());

    fireEvent.doubleClick(screen.getByText('c'));
    await screen.findByText('Edit NOTE');
    expect(screen.getByTestId('monaco-original')).toHaveValue('a\nb');
    expect(screen.getByTestId('monaco-modified')).toHaveValue('a\nc');
  });

  it('primary-key values cannot be edited inline', () => {
    renderView();
    fireEvent.doubleClick(screen.getAllByText('1')[0]);
    expect(screen.queryByText('Edit ID')).toBeNull();
    expect(screen.queryByTestId('monaco-modified')).toBeNull();
  });

  it('in insert mode the editor starts from an empty original', async () => {
    const { container } = renderView({ before: {}, after: { ID: '', NAME: '' }, isInsertMode: true });
    // only the NAME cells are editable (cursor-pointer); ID is the PK
    const editable = container.querySelectorAll('.cursor-pointer');
    expect(editable).toHaveLength(2);
    expect(container.querySelectorAll('.cursor-not-allowed')).toHaveLength(2);
    fireEvent.doubleClick(editable[1]);
    await screen.findByText('Edit NAME');
    expect(screen.getByTestId('monaco-original')).toHaveValue('');
    expect(screen.getByTestId('monaco-modified')).toHaveValue('');
  });

  it('the editor theme follows the app theme', async () => {
    renderView({ themeMode: ThemeMode.Dark });
    fireEvent.doubleClick(screen.getByText('beta'));
    await screen.findByText('Edit NAME');
    expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-theme', 'vs-dark');
  });

  it('a null proposed value opens the editor blank against the original text', async () => {
    renderView({ after: { ...after, NOTE: null } });
    fireEvent.doubleClick(screen.getByText('null'));
    await screen.findByText('Edit NOTE');
    expect(screen.getByTestId('monaco-original')).toHaveValue('a\nb');
    expect(screen.getByTestId('monaco-modified')).toHaveValue('');
  });

  it('disposes the content-change subscription together with the editor', async () => {
    renderView();
    fireEvent.doubleClick(screen.getByText('beta'));
    await screen.findByText('Edit NAME');
    expect(monaco.listeners).toHaveLength(1);
    expect(monaco.disposed).toBe(0);
    monaco.onDispose?.();
    expect(monaco.disposed).toBe(1);
  });
});

describe('DiffView — insert mode', () => {
  it('opens in edit mode with the insert affordances and without reject/edit buttons', async () => {
    const { props } = renderView({ before: {}, after: { ID: '', NAME: '' }, isInsertMode: true });
    expect(screen.getByText('Insert New Record')).toBeInTheDocument();
    expect(screen.getByText('INSERT MODE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Proposed/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reject/ })).toBeNull();

    // the drawer is already open so the operator can fill the row; the PK is not offered
    await screen.findByText('Edit Proposed Values');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    // inserting needs no diff
    const insert = screen.getByRole('button', { name: /Insert Record/ });
    expect(insert).toBeEnabled();
    fireEvent.click(insert);
    expect(props.onApprove).toHaveBeenCalledTimes(1);
  });
});

describe('DiffView — synchronized scrolling', () => {
  function panes(container: HTMLElement) {
    const list = container.querySelectorAll<HTMLDivElement>('.diff-view');
    expect(list).toHaveLength(2);
    for (const el of list) {
      // jsdom has no layout: make the scroll offsets plain writable fields
      Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
      Object.defineProperty(el, 'scrollLeft', { value: 0, writable: true });
    }
    return { left: list[0], right: list[1] };
  }

  it('mirrors the before pane onto the after pane and back', () => {
    const { container } = renderView();
    const { left, right } = panes(container);

    left.scrollTop = 120;
    left.scrollLeft = 30;
    fireEvent.scroll(left);
    expect(right.scrollTop).toBe(120);
    expect(right.scrollLeft).toBe(30);

    right.scrollTop = 5;
    right.scrollLeft = 0;
    fireEvent.scroll(right);
    expect(left.scrollTop).toBe(5);
    expect(left.scrollLeft).toBe(0);
  });
});
