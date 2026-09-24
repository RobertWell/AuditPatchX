import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SqlReviewPanel } from './SqlReviewPanel';

const baseProps = {
  onClose: vi.fn(),
  rowId: 'ROW-1',
  column: 'DESCRIPTION',
  sourceValue: 'line one\nline two',
  targetValue: 'line one\nline TWO changed',
  onSubmitReview: vi.fn(),
};

describe('SqlReviewPanel — header and analysis', () => {
  it('shows the row, the column, the risk badges and the diff analysis', () => {
    render(<SqlReviewPanel {...baseProps} />);
    expect(screen.getByText('Deep SQL Review')).toBeInTheDocument();
    expect(screen.getAllByText('ROW-1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('DESCRIPTION')).toBeInTheDocument();
    expect(screen.getByText('1 Changed Lines')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('0 added line(s)')).toBeInTheDocument();
    expect(screen.getByText('0 removed line(s)')).toBeInTheDocument();
    expect(screen.getByText('1 modified line(s)')).toBeInTheDocument();
  });

  it('raises the complexity to Medium when more than five lines changed', () => {
    const source = Array.from({ length: 6 }, (_, i) => `s${i}`).join('\n');
    const target = Array.from({ length: 6 }, (_, i) => `t${i}`).join('\n');
    render(<SqlReviewPanel {...baseProps} sourceValue={source} targetValue={target} />);
    expect(screen.getByText('6 Changed Lines')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('6 modified line(s)')).toBeInTheDocument();
    expect(screen.getByText('+6')).toBeInTheDocument();
  });
});

describe('SqlReviewPanel — diff views', () => {
  it('split view hides unchanged lines by default and skips added lines in the source column', () => {
    render(<SqlReviewPanel {...baseProps} sourceValue={'keep\nold'} targetValue={'keep\nnew\nextra'} />);
    expect(screen.queryByText('keep')).toBeNull();
    expect(screen.getByText('old')).toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
    // the added line only exists on the target side
    expect(screen.getAllByText('extra')).toHaveLength(1);
    expect(screen.getByText('1 added line(s)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show Unchanged/ }));
    expect(screen.getAllByText('keep')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Hide Unchanged/ }));
    expect(screen.queryByText('keep')).toBeNull();
  });

  it('split view skips removed lines in the target column', () => {
    render(<SqlReviewPanel {...baseProps} sourceValue={'keep\nold\ngone'} targetValue={'keep\nnew'} />);
    expect(screen.getAllByText('gone')).toHaveLength(1);
    expect(screen.getByText('1 removed line(s)')).toBeInTheDocument();
  });

  it('unified view marks modified lines as a -/+ pair and removed lines with -', () => {
    render(<SqlReviewPanel {...baseProps} sourceValue={'keep\nold\ngone'} targetValue={'keep\nnew'} />);
    fireEvent.click(screen.getByRole('button', { name: /Unified/ }));
    expect(screen.getAllByText('-')).toHaveLength(2);
    expect(screen.getAllByText('+')).toHaveLength(1);
    expect(screen.queryByText('keep')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show Unchanged/ }));
    expect(screen.getByText('keep')).toBeInTheDocument();

    // switching back to split keeps the unchanged toggle
    fireEvent.click(screen.getByRole('button', { name: /Split/ }));
    expect(screen.getAllByText('keep')).toHaveLength(2);
  });

  it('unified view marks added lines with +', () => {
    render(<SqlReviewPanel {...baseProps} sourceValue={'keep\nold'} targetValue={'keep\nnew\nextra'} />);
    fireEvent.click(screen.getByRole('button', { name: /Unified/ }));
    expect(screen.getAllByText('+')).toHaveLength(2);
    expect(screen.getAllByText('-')).toHaveLength(1);
    expect(screen.getByText('extra')).toBeInTheDocument();
  });
});

describe('SqlReviewPanel — decision', () => {
  it('Submit stays disabled until a decision is made; approving submits the comment', () => {
    const onSubmitReview = vi.fn();
    render(<SqlReviewPanel {...baseProps} onSubmitReview={onSubmitReview} />);
    const submit = screen.getByRole('button', { name: 'Submit Review' });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmitReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Approve Change/ }));
    fireEvent.change(screen.getByPlaceholderText('Add review comments...'), { target: { value: 'looks fine' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onSubmitReview).toHaveBeenCalledWith({
      rowId: 'ROW-1', column: 'DESCRIPTION', decision: 'approved', comment: 'looks fine',
    });
  });

  it('rejecting submits a rejected decision (the later choice wins)', () => {
    const onSubmitReview = vi.fn();
    render(<SqlReviewPanel {...baseProps} onSubmitReview={onSubmitReview} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve Change/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reject Change/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));
    expect(onSubmitReview).toHaveBeenCalledWith({
      rowId: 'ROW-1', column: 'DESCRIPTION', decision: 'rejected', comment: '',
    });
  });

  it('Cancel and the header close icon both call onClose without submitting', () => {
    const onClose = vi.fn();
    const onSubmitReview = vi.fn();
    render(<SqlReviewPanel {...baseProps} onClose={onClose} onSubmitReview={onSubmitReview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const iconOnly = screen.getAllByRole('button').find((b) => b.textContent === '')!;
    fireEvent.click(iconOnly);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSubmitReview).not.toHaveBeenCalled();
  });
});
