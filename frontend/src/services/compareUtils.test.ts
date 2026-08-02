import { describe, it, expect } from 'vitest';
import { buildReviewRequest } from './compareUtils';
import type { CompareJobDiffRow, CompareJobRequest } from '../types/api';

const config: CompareJobRequest = {
  tableOne: 'S.SRC',
  tableTwo: 'S.TGT',
  syncPk: ['ID'],
  ignoreColumns: ['UPDATED_AT'],
  limit: 100,
};

const row: CompareJobDiffRow = {
  pk: '42',
  pkMap: { ID: '42' },
  status: 'UPDATE',
  changedColumns: 1,
  updatedBy: '',
  reviewStatus: '',
  changes: [],
} as CompareJobDiffRow;

describe('buildReviewRequest', () => {
  it('carries table direction verbatim from the compare config', () => {
    const req = buildReviewRequest(row, config, 'APPROVED');
    expect(req.tableOne).toBe('S.SRC');
    expect(req.tableTwo).toBe('S.TGT');
  });

  it('copies pk/pkMap/rowStatus from the row and status from the arg', () => {
    const req = buildReviewRequest(row, config, 'APPROVED');
    expect(req.pk).toBe('42');
    expect(req.pkMap).toEqual({ ID: '42' });
    expect(req.rowStatus).toBe('UPDATE');
    expect(req.status).toBe('APPROVED');
  });

  it('threads syncPk and ignoreColumns through', () => {
    const req = buildReviewRequest(row, config, 'REJECTED');
    expect(req.syncPk).toEqual(['ID']);
    expect(req.ignoreColumns).toEqual(['UPDATED_AT']);
    expect(req.status).toBe('REJECTED');
  });
});
