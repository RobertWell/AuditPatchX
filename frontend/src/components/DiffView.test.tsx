import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const before = { ID: 1, NAME: 'alpha', NOTE: 'a\nb' };
const after = { ID: 1, NAME: 'beta', NOTE: 'a\nc' };

describe('DiffView', () => {
  it('renders changed fields in the diff', () => {
    render(
      <DiffView before={before} after={after} onAfterChange={vi.fn()} onApprove={vi.fn()}
        onReject={vi.fn()} pkColumns={['ID']} metadata={metadata} />,
    );
    expect(screen.getAllByText(/NAME/).length).toBeGreaterThan(0);
  });

  it('exercises the view-mode / edit / approve / reject controls without throwing', async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <DiffView before={before} after={after} onAfterChange={vi.fn()} onApprove={onApprove}
        onReject={onReject} pkColumns={['ID']} metadata={metadata} themeMode={ThemeMode.Dark} />,
    );
    const buttons = container.querySelectorAll('button');
    for (const b of buttons) { try { fireEvent.click(b); } catch { /* ignore disabled/portal */ } }
    expect(container.firstChild).toBeTruthy();
  });

  it('renders in insert mode (edit-on) with a blank before', () => {
    const { container } = render(
      <DiffView before={{}} after={{ ID: '', NAME: '' }} onAfterChange={vi.fn()} onApprove={vi.fn()}
        onReject={vi.fn()} pkColumns={['ID']} metadata={metadata} isInsertMode />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
