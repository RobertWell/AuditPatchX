import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSqlFile, generateExportSql } from './exportSql';
import type { CompareJobDiffRow, CompareJobRequest } from '../types/api';

const config: CompareJobRequest = {
  tableOne: 'schema1.employees',
  tableTwo: 'schema2.employees',
  syncPk: ['id'],
  ignoreColumns: [],
  limit: 100,
};

const updateRow: CompareJobDiffRow = {
  pk: '42',
  pkMap: { ID: '42' },
  status: 'UPDATE',
  changedColumns: 2,
  updatedBy: 'system',
  reviewStatus: 'APPROVED',
  changes: [
    { column: 'NAME', sourceValue: 'Alice', targetValue: 'Alicia', isLongText: false },
    { column: 'DEPT', sourceValue: 'Eng', targetValue: 'Engineering', isLongText: false },
  ],
};

const insertRow: CompareJobDiffRow = {
  pk: '99',
  pkMap: { ID: '99' },
  status: 'INSERT',
  changedColumns: 2,
  updatedBy: 'system',
  reviewStatus: 'PENDING',
  changes: [
    { column: 'NAME', sourceValue: 'Bob', targetValue: 'NULL', isLongText: false },
    { column: 'DEPT', sourceValue: 'HR', targetValue: 'NULL', isLongText: false },
  ],
};

describe('generateExportSql', () => {
  it('generates UPDATE statement for UPDATE rows', () => {
    const sql = generateExportSql([updateRow], config);
    expect(sql).toContain('UPDATE schema2.employees');
    expect(sql).toContain("NAME = 'Alice'");
    expect(sql).toContain("DEPT = 'Eng'");
    expect(sql).toContain("WHERE ID = '42'");
  });

  it('generates INSERT statement for INSERT rows', () => {
    const sql = generateExportSql([insertRow], config);
    expect(sql).toContain('INSERT INTO schema2.employees');
    expect(sql).toContain('NAME, DEPT');
    expect(sql).toContain("'Bob', 'HR'");
  });

  it('skips IGNORED rows and adds a comment', () => {
    const ignoredRow: CompareJobDiffRow = { ...updateRow, status: 'IGNORED', pk: '7', pkMap: { ID: '7' } };
    const sql = generateExportSql([ignoredRow], config);
    expect(sql).toContain('-- Skipped row: 7');
    expect(sql).not.toContain('UPDATE');
  });

  it('returns empty string for empty input', () => {
    expect(generateExportSql([], config)).toBe('');
  });

  it('renders NULL (not quoted) for NULL source values', () => {
    const row: CompareJobDiffRow = {
      ...updateRow,
      changes: [{ column: 'DEPT', sourceValue: 'NULL', targetValue: 'Engineering', isLongText: false }],
    };
    const sql = generateExportSql([row], config);
    expect(sql).toContain('DEPT = NULL');
    expect(sql).not.toContain("'NULL'");
  });

  it('escapes single quotes in values', () => {
    const row: CompareJobDiffRow = {
      ...updateRow,
      changes: [{ column: 'NAME', sourceValue: "O'Brien", targetValue: 'x', isLongText: false }],
    };
    const sql = generateExportSql([row], config);
    expect(sql).toContain("NAME = 'O''Brien'");
  });

  it('generates DELETE statement for DELETE rows', () => {
    const deleteRow: CompareJobDiffRow = {
      pk: '55',
      pkMap: { ID: '55' },
      status: 'DELETE',
      changedColumns: 0,
      updatedBy: 'system',
      reviewStatus: 'PENDING',
      changes: [],
    };
    const sql = generateExportSql([deleteRow], config);
    expect(sql).toContain('DELETE FROM schema2.employees');
    expect(sql).toContain("WHERE ID = '55'");
  });
});

describe('generateExportSql — empty pkMap guard', () => {
  it('never emits an unbounded UPDATE: an empty pkMap becomes an ERROR comment', () => {
    const row: CompareJobDiffRow = { ...updateRow, pk: '42', pkMap: {} };
    expect(generateExportSql([row], config)).toBe('-- ERROR: empty pkMap for row 42');
  });

  it('never emits an unbounded DELETE: an empty pkMap becomes an ERROR comment', () => {
    const row: CompareJobDiffRow = {
      pk: '55', pkMap: {}, status: 'DELETE', changedColumns: 0, updatedBy: 'system', reviewStatus: 'PENDING', changes: [],
    };
    expect(generateExportSql([row], config)).toBe('-- ERROR: empty pkMap for row 55');
  });

  it('emits one statement per row, newline separated, in input order', () => {
    const lines = generateExportSql([updateRow, insertRow], config).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^UPDATE /);
    expect(lines[1]).toMatch(/^INSERT INTO /);
  });
});

/** jsdom's Blob has no text(); FileReader is the portable way to read it back. */
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('downloadSqlFile', () => {
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  let clicked: { href: string; download: string; attached: boolean } | null;

  beforeEach(() => {
    // jsdom has no object-URL support, and the anchor click must not navigate
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;
    clicked = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = { href: this.href, download: this.download, attached: document.body.contains(this) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (URL as any).createObjectURL;
    delete (URL as any).revokeObjectURL;
  });

  it('wraps the SQL in a text/plain Blob and clicks a temporary anchor named after the file', async () => {
    downloadSqlFile('SELECT 1;', 'patch.sql');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain');
    expect(await readBlob(blob)).toBe('SELECT 1;');

    // the anchor was attached to the document when clicked, then removed and its URL released
    expect(clicked).toEqual({ href: 'blob:mock-url', download: 'patch.sql', attached: true });
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('defaults the filename to export.sql', () => {
    downloadSqlFile('-- empty');
    expect(clicked?.download).toBe('export.sql');
  });
});
