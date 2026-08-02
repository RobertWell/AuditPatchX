import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders the brand and both nav sections', () => {
    render(<Sidebar currentPage="patches" onNavigate={vi.fn()} />);
    expect(screen.getByText('AuditPatchX')).toBeInTheDocument();
    expect(screen.getByText('Patch Management')).toBeInTheDocument();
    expect(screen.getByText('Database Sync')).toBeInTheDocument();
    expect(screen.getByText('Patches')).toBeInTheDocument();
    expect(screen.getByText('Compare Job')).toBeInTheDocument();
  });

  it('fires onNavigate with the item id when a menu button is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar currentPage="patches" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Compare Job'));
    expect(onNavigate).toHaveBeenCalledWith('compare');
  });

  it('marks the active page (styling branch)', () => {
    const { rerender } = render(<Sidebar currentPage="patches" onNavigate={vi.fn()} />);
    // active item carries the accent class
    expect(screen.getByText('Patches').closest('button')!.className).toContain('sidebar-accent');
    rerender(<Sidebar currentPage="compare" onNavigate={vi.fn()} />);
    expect(screen.getByText('Compare Job').closest('button')!.className).toContain('sidebar-accent');
  });
});
