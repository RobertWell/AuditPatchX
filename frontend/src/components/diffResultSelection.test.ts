import { describe, expect, it } from 'vitest';
import {
  getReviewTargetColumn,
  getSelectionState,
  setAllSelection,
  toggleSelection,
} from './diffResultSelection';
import type { CompareJobDiffRow } from '../types/api';

const sampleRows: CompareJobDiffRow[] = [
  {
    pk: '1001',
    status: 'UPDATE',
    changedColumns: 2,
    updatedBy: 'alice',
    reviewStatus: 'PENDING',
    changes: [
      { column: 'TITLE', sourceValue: 'Old', targetValue: 'New', isLongText: false },
      { column: 'SQL_TEXT', sourceValue: 'select 1', targetValue: 'select 2', isLongText: true },
    ],
  },
  {
    pk: '1002',
    status: 'INSERT',
    changedColumns: 1,
    updatedBy: 'bob',
    reviewStatus: 'PENDING',
    changes: [
      { column: 'NOTE', sourceValue: '', targetValue: 'fresh row', isLongText: false },
    ],
  },
];

describe('diffResultSelection', () => {
  it('computes header checkbox state for none, single, and all selected', () => {
    expect(getSelectionState(2, 0)).toEqual({
      checked: false,
      indeterminate: false,
      canReviewSingle: false,
      canBulkApprove: false,
    });

    expect(getSelectionState(2, 1)).toEqual({
      checked: false,
      indeterminate: true,
      canReviewSingle: true,
      canBulkApprove: true,
    });

    expect(getSelectionState(2, 2)).toEqual({
      checked: true,
      indeterminate: false,
      canReviewSingle: false,
      canBulkApprove: true,
    });
  });

  it('toggles row selection and select-all state', () => {
    const selected = toggleSelection(new Set<string>(), '1001');
    expect(Array.from(selected)).toEqual(['1001']);

    const deselected = toggleSelection(selected, '1001');
    expect(Array.from(deselected)).toEqual([]);

    expect(Array.from(setAllSelection(sampleRows, true))).toEqual(['1001', '1002']);
    expect(Array.from(setAllSelection(sampleRows, false))).toEqual([]);
  });

  it('prefers long text columns for single-row review targets', () => {
    expect(getReviewTargetColumn(sampleRows[0])).toBe('SQL_TEXT');
    expect(getReviewTargetColumn(sampleRows[1])).toBe('NOTE');
  });
});
