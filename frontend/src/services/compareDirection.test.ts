import { describe, it, expect } from 'vitest';
import { buildReviewRequest } from './compareUtils';
import type { CompareJobDiffRow, CompareJobRequest } from '../types/api';

// ── fixtures ──────────────────────────────────────────────────────────────

const makeRow = (pk: string, status: 'UPDATE' | 'INSERT'): CompareJobDiffRow => ({
  pk,
  pkMap: { ID: pk },
  status,
  changedColumns: 1,
  updatedBy: 'system',
  reviewStatus: 'PENDING',
  changes: [{ column: 'VALUE', sourceValue: 'src', targetValue: 'tgt', isLongText: false }],
});

const aToB: CompareJobRequest = {
  tableOne: 'SCHEMA.TABLE_A',
  tableTwo: 'SCHEMA.TABLE_B',
  syncPk: ['ID'],
  ignoreColumns: [],
  limit: 100,
};

const bToA: CompareJobRequest = {
  tableOne: 'SCHEMA.TABLE_B',
  tableTwo: 'SCHEMA.TABLE_A',
  syncPk: ['ID'],
  ignoreColumns: [],
  limit: 100,
};

// ── 1. Frontend sends different signal for each direction ──────────────────

describe('Compare direction signal', () => {
  it('A→B and B→A configs have tableOne and tableTwo swapped', () => {
    expect(aToB.tableOne).toBe(bToA.tableTwo);
    expect(aToB.tableTwo).toBe(bToA.tableOne);
  });

  it('A→B approve request carries tableOne=A tableTwo=B', () => {
    const req = buildReviewRequest(makeRow('1', 'UPDATE'), aToB, 'APPROVED');
    expect(req.tableOne).toBe('SCHEMA.TABLE_A');
    expect(req.tableTwo).toBe('SCHEMA.TABLE_B');
  });

  it('B→A approve request carries tableOne=B tableTwo=A', () => {
    const req = buildReviewRequest(makeRow('1', 'UPDATE'), bToA, 'APPROVED');
    expect(req.tableOne).toBe('SCHEMA.TABLE_B');
    expect(req.tableTwo).toBe('SCHEMA.TABLE_A');
  });

  it('A→B and B→A approve requests for the same row are not equal', () => {
    const row = makeRow('1', 'UPDATE');
    const atobReq = buildReviewRequest(row, aToB, 'APPROVED');
    const btoaReq = buildReviewRequest(row, bToA, 'APPROVED');
    expect(atobReq).not.toEqual(btoaReq);
  });
});

// ── 2. Approve request direction matches compare direction exactly ─────────

describe('Approve request direction integrity', () => {
  it('pk and pkMap flow from the diff row unchanged', () => {
    const row = makeRow('42', 'INSERT');
    const req = buildReviewRequest(row, aToB, 'APPROVED');
    expect(req.pk).toBe('42');
    expect(req.pkMap).toEqual({ ID: '42' });
  });

  it('rowStatus mirrors the diff row status for correct SQL choice', () => {
    expect(buildReviewRequest(makeRow('1', 'UPDATE'), aToB, 'APPROVED').rowStatus).toBe('UPDATE');
    expect(buildReviewRequest(makeRow('1', 'INSERT'), aToB, 'APPROVED').rowStatus).toBe('INSERT');
  });

  it('syncPk and ignoreColumns are copied from the originating compare config', () => {
    const config: CompareJobRequest = { ...aToB, syncPk: ['COL1', 'COL2'], ignoreColumns: ['UPDATED_AT'] };
    const req = buildReviewRequest(makeRow('1', 'UPDATE'), config, 'APPROVED');
    expect(req.syncPk).toEqual(['COL1', 'COL2']);
    expect(req.ignoreColumns).toEqual(['UPDATED_AT']);
  });

  it('REJECTED decision preserves direction — status is REJECTED but tables are unchanged', () => {
    const req = buildReviewRequest(makeRow('1', 'UPDATE'), aToB, 'REJECTED');
    expect(req.status).toBe('REJECTED');
    expect(req.tableOne).toBe('SCHEMA.TABLE_A');
    expect(req.tableTwo).toBe('SCHEMA.TABLE_B');
  });
});

// ── 3. Guard: swapping direction after compare is a different operation ────

describe('Direction swap is a distinct compare operation', () => {
  it('A→B approve rowStatus=INSERT routes insert into TABLE_B not TABLE_A', () => {
    const req = buildReviewRequest(makeRow('10', 'INSERT'), aToB, 'APPROVED');
    // tableTwo is the write target for INSERT
    expect(req.tableTwo).toBe('SCHEMA.TABLE_B');
    expect(req.tableOne).not.toBe(req.tableTwo);
  });

  it('B→A approve rowStatus=INSERT routes insert into TABLE_A not TABLE_B', () => {
    const req = buildReviewRequest(makeRow('20', 'INSERT'), bToA, 'APPROVED');
    expect(req.tableTwo).toBe('SCHEMA.TABLE_A');
    expect(req.tableOne).not.toBe(req.tableTwo);
  });

  it('approve request built from wrong config would write to wrong table', () => {
    const row = makeRow('10', 'INSERT');
    const correctReq = buildReviewRequest(row, aToB, 'APPROVED');  // target = TABLE_B ✓
    const wrongReq   = buildReviewRequest(row, bToA, 'APPROVED');  // target = TABLE_A ✗

    expect(correctReq.tableTwo).toBe('SCHEMA.TABLE_B');
    expect(wrongReq.tableTwo).toBe('SCHEMA.TABLE_A');
    expect(correctReq.tableTwo).not.toBe(wrongReq.tableTwo);
  });
});
