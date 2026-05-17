export type SqlReviewDiffLineType = 'unchanged' | 'added' | 'removed' | 'modified';

export interface SqlReviewDiffLine {
  type: SqlReviewDiffLineType;
  sourceLine?: string;
  targetLine?: string;
  sourceLineNum?: number;
  targetLineNum?: number;
}

export interface SqlReviewDiffSummary {
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  changedLines: number;
}

export function buildSqlReviewDiff(sourceValue: string, targetValue: string): SqlReviewDiffLine[] {
  const sourceLinesArray = sourceValue.split('\n');
  const targetLinesArray = targetValue.split('\n');
  const diff: SqlReviewDiffLine[] = [];

  let sourceIdx = 0;
  let targetIdx = 0;

  while (sourceIdx < sourceLinesArray.length || targetIdx < targetLinesArray.length) {
    const sourceLine = sourceLinesArray[sourceIdx];
    const targetLine = targetLinesArray[targetIdx];

    if (sourceLine === targetLine) {
      diff.push({
        type: 'unchanged',
        sourceLine,
        targetLine,
        sourceLineNum: sourceIdx + 1,
        targetLineNum: targetIdx + 1
      });
      sourceIdx++;
      targetIdx++;
    } else if (sourceIdx >= sourceLinesArray.length) {
      diff.push({
        type: 'added',
        targetLine,
        targetLineNum: targetIdx + 1
      });
      targetIdx++;
    } else if (targetIdx >= targetLinesArray.length) {
      diff.push({
        type: 'removed',
        sourceLine,
        sourceLineNum: sourceIdx + 1
      });
      sourceIdx++;
    } else {
      diff.push({
        type: 'modified',
        sourceLine,
        targetLine,
        sourceLineNum: sourceIdx + 1,
        targetLineNum: targetIdx + 1
      });
      sourceIdx++;
      targetIdx++;
    }
  }

  return diff;
}

export function summarizeSqlReviewDiff(diffLines: SqlReviewDiffLine[]): SqlReviewDiffSummary {
  const addedLines = diffLines.filter(line => line.type === 'added').length;
  const removedLines = diffLines.filter(line => line.type === 'removed').length;
  const modifiedLines = diffLines.filter(line => line.type === 'modified').length;

  return {
    addedLines,
    removedLines,
    modifiedLines,
    changedLines: addedLines + removedLines + modifiedLines
  };
}
