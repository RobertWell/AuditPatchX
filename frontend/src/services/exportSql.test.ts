import { describe, expect, it } from 'vitest';
import { generateExportSql } from './exportSql';
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
