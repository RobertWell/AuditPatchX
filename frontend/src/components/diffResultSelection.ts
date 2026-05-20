import type { CompareJobDiffRow } from '../types/api';

export interface SelectionState {
  checked: boolean;
  indeterminate: boolean;
  canReviewSingle: boolean;
  canBulkApprove: boolean;
}

export function getSelectionState(totalRows: number, selectedRows: number): SelectionState {
  return {
    checked: totalRows > 0 && selectedRows === totalRows,
    indeterminate: selectedRows > 0 && selectedRows < totalRows,
    canReviewSingle: selectedRows === 1,
    canBulkApprove: selectedRows > 1,
  };
}

export function toggleSelection(current: Set<string>, pk: string): Set<string> {
  const next = new Set(current);
  if (next.has(pk)) {
    next.delete(pk);
  } else {
    next.add(pk);
  }
  return next;
}

export function setAllSelection(rows: CompareJobDiffRow[], selectAll: boolean): Set<string> {
  return selectAll ? new Set(rows.map((row) => row.pk)) : new Set();
}

export function getReviewTargetColumn(row: CompareJobDiffRow): string | null {
  return row.changes.find((change) => change.isLongText)?.column
    ?? row.changes[0]?.column
    ?? null;
}
