import { describe, it, expect } from 'vitest';
import { computeDiff, getChangedFields, formatValue } from './diffUtils';

describe('getChangedFields', () => {
  it('returns only the keys whose after-value differs', () => {
    const before = { A: 1, B: 'x', C: 3 };
    const after = { A: 1, B: 'y', C: 3 };
    expect(getChangedFields(before, after)).toEqual({ B: 'y' });
  });

  it('treats deep-equal objects as unchanged (JSON compare)', () => {
    const before = { J: { a: 1 } };
    const after = { J: { a: 1 } };
    expect(getChangedFields(before, after)).toEqual({});
  });

  it('detects a nested-object change', () => {
    expect(getChangedFields({ J: { a: 1 } }, { J: { a: 2 } })).toEqual({ J: { a: 2 } });
  });

  it('reports a null->value change', () => {
    expect(getChangedFields({ A: null }, { A: 5 })).toEqual({ A: 5 });
  });
});

describe('formatValue', () => {
  it('renders null/undefined as "null"', () => {
    expect(formatValue(null)).toBe('null');
    expect(formatValue(undefined)).toBe('null');
  });
  it('pretty-prints objects', () => {
    expect(formatValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });
  it('stringifies scalars', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue('hi')).toBe('hi');
  });
});

describe('computeDiff', () => {
  it('flags changed vs unchanged fields', () => {
    const diffs = computeDiff({ A: 'x', B: 1 }, { A: 'y', B: 1 });
    const a = diffs.find((d) => d.field === 'A')!;
    const b = diffs.find((d) => d.field === 'B')!;
    expect(a.changed).toBe(true);
    expect(b.changed).toBe(false);
  });

  it('computes a word-level text diff for single-line string changes', () => {
    const diffs = computeDiff({ A: 'the cat' }, { A: 'the dog' });
    const a = diffs.find((d) => d.field === 'A')!;
    expect(a.textDiffMode).toBe('words');
    expect(a.textDiff).toBeTruthy();
  });

  it('computes a line-level diff when newlines are present', () => {
    const diffs = computeDiff({ A: 'l1\nl2' }, { A: 'l1\nl3' });
    const a = diffs.find((d) => d.field === 'A')!;
    expect(a.textDiffMode).toBe('lines');
  });

  it('honours includeColumns (drops columns not listed)', () => {
    const diffs = computeDiff(
      { A: 1, B: 2 },
      { A: 9, B: 8 },
      { columns: [{ name: 'A', type: 'NUMBER' }, { name: 'B', type: 'NUMBER' }], diffPolicy: { includeColumns: ['A'] } },
    );
    expect(diffs.map((d) => d.field)).toEqual(['A']);
  });

  it('honours excludeColumns', () => {
    const diffs = computeDiff(
      { A: 1, B: 2 },
      { A: 9, B: 8 },
      { columns: [{ name: 'A', type: 'NUMBER' }, { name: 'B', type: 'NUMBER' }], diffPolicy: { excludeColumns: ['B'] } },
    );
    expect(diffs.map((d) => d.field)).toEqual(['A']);
  });

  it('honours excludeTypes by column type', () => {
    const diffs = computeDiff(
      { A: 'p', B: 'q' },
      { A: 'x', B: 'y' },
      { columns: [{ name: 'A', type: 'CLOB' }, { name: 'B', type: 'VARCHAR2' }], diffPolicy: { excludeTypes: ['CLOB'] } },
    );
    expect(diffs.map((d) => d.field)).toEqual(['B']);
  });
});
