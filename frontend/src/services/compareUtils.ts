import type { CompareJobDiffRow, CompareJobRequest, CompareReviewRequest } from '../types/api';

/**
 * Build the review request for a compare diff row approval/rejection.
 *
 * tableOne and tableTwo are taken verbatim from the originating compare config,
 * preserving the A→B or B→A direction so the backend writes to the correct table.
 */
export function buildReviewRequest(
  row: CompareJobDiffRow,
  config: CompareJobRequest,
  status: 'APPROVED' | 'REJECTED',
): CompareReviewRequest {
  return {
    pk: row.pk,
    status,
    tableOne: config.tableOne,
    tableTwo: config.tableTwo,
    rowStatus: row.status,
    syncPk: config.syncPk,
    ignoreColumns: config.ignoreColumns,
    pkMap: row.pkMap,
  };
}
