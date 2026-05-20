import type { CompareJobDiffRow, CompareJobRequest } from '../types/api';

function escapeValue(val: string): string {
  return val.replace(/'/g, "''");
}

export function generateExportSql(
  rows: CompareJobDiffRow[],
  config: CompareJobRequest
): string {
  const targetTable = config.tableTwo;

  const statements = rows.map((row) => {
    if (row.status === 'UPDATE') {
      const setClause = row.changes
        .map((c) => `${c.column} = '${escapeValue(c.sourceValue)}'`)
        .join(', ');
      const whereClause = Object.entries(row.pkMap)
        .map(([col, val]) => `${col} = '${escapeValue(val)}'`)
        .join(' AND ');
      return `UPDATE ${targetTable} SET ${setClause} WHERE ${whereClause};`;
    }

    if (row.status === 'INSERT') {
      const cols = row.changes.map((c) => c.column).join(', ');
      const vals = row.changes.map((c) => `'${escapeValue(c.sourceValue)}'`).join(', ');
      return `INSERT INTO ${targetTable} (${cols}) VALUES (${vals});`;
    }

    if (row.status === 'DELETE') {
      const whereClause = Object.entries(row.pkMap)
        .map(([col, val]) => `${col} = '${escapeValue(val)}'`)
        .join(' AND ');
      return `DELETE FROM ${targetTable} WHERE ${whereClause};`;
    }

    return `-- Skipped row: ${row.pk} (status: ${row.status})`;
  });

  return statements.join('\n');
}

export function downloadSqlFile(sql: string, filename = 'export.sql'): void {
  const blob = new Blob([sql], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
