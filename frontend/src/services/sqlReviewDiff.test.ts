import { describe, expect, it } from 'vitest';
import { buildSqlReviewDiff, summarizeSqlReviewDiff } from './sqlReviewDiff';

describe('sqlReviewDiff', () => {
  it('marks identical lines as unchanged', () => {
    const diff = buildSqlReviewDiff('select 1\nfrom dual', 'select 1\nfrom dual');

    expect(diff).toEqual([
      {
        type: 'unchanged',
        sourceLine: 'select 1',
        targetLine: 'select 1',
        sourceLineNum: 1,
        targetLineNum: 1
      },
      {
        type: 'unchanged',
        sourceLine: 'from dual',
        targetLine: 'from dual',
        sourceLineNum: 2,
        targetLineNum: 2
      }
    ]);
    expect(summarizeSqlReviewDiff(diff)).toEqual({
      addedLines: 0,
      removedLines: 0,
      modifiedLines: 0,
      changedLines: 0
    });
  });

  it('tracks modified and added target lines', () => {
    const diff = buildSqlReviewDiff(
      'select status\nfrom trdmgmr.transactions',
      `select status, amount
from trdmgmr_uat.transactions
where status = 'PENDING'`
    );

    expect(diff.map(line => line.type)).toEqual(['modified', 'modified', 'added']);
    expect(diff[0]).toMatchObject({
      sourceLine: 'select status',
      targetLine: 'select status, amount',
      sourceLineNum: 1,
      targetLineNum: 1
    });
    expect(diff[2]).toMatchObject({
      type: 'added',
      targetLine: "where status = 'PENDING'",
      targetLineNum: 3
    });
    expect(summarizeSqlReviewDiff(diff)).toEqual({
      addedLines: 1,
      removedLines: 0,
      modifiedLines: 2,
      changedLines: 3
    });
  });

  it('tracks removed source lines', () => {
    const diff = buildSqlReviewDiff(
      `select status
from trdmgmr.transactions
where status = 'APPROVED'`,
      'select status\nfrom trdmgmr.transactions'
    );

    expect(diff.map(line => line.type)).toEqual(['unchanged', 'unchanged', 'removed']);
    expect(diff[2]).toMatchObject({
      type: 'removed',
      sourceLine: "where status = 'APPROVED'",
      sourceLineNum: 3
    });
    expect(summarizeSqlReviewDiff(diff)).toEqual({
      addedLines: 0,
      removedLines: 1,
      modifiedLines: 0,
      changedLines: 1
    });
  });
});
