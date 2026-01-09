import * as Diff from 'diff';

export interface FieldDiff {
  field: string;
  before: any;
  after: any;
  changed: boolean;
  textDiff?: Diff.Change[];
}

/**
 * Compute differences between two records
 */
export function computeDiff(
  before: Record<string, any>,
  after: Record<string, any>,
  metadata?: {
    columns: { name: string; type: string }[];
    diffPolicy?: {
      excludeTypes?: string[];
      excludeColumns?: string[];
      includeColumns?: string[];
    };
  }
): FieldDiff[] {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: FieldDiff[] = [];

  for (const key of allKeys) {
    // Apply diffPolicy rules
    if (metadata?.diffPolicy) {
      const { excludeTypes, excludeColumns, includeColumns } = metadata.diffPolicy;
      const column = metadata.columns.find((c) => c.name.toUpperCase() === key.toUpperCase());

      // 1. Check includeColumns
      if (includeColumns && !includeColumns.map((c) => c.toUpperCase()).includes(key.toUpperCase())) {
        continue;
      }

      // 2. Check excludeColumns
      if (excludeColumns && excludeColumns.map((c) => c.toUpperCase()).includes(key.toUpperCase())) {
        continue;
      }

      // 3. Check excludeTypes
      if (column && excludeTypes && excludeTypes.includes(column.type.toUpperCase())) {
        continue;
      }
    }

    const beforeValue = before[key];
    const afterValue = after[key];
    const changed = !isEqual(beforeValue, afterValue);

    const diff: FieldDiff = {
      field: key,
      before: beforeValue,
      after: afterValue,
      changed,
    };

    // For string values that changed, compute text diff
    if (
      changed &&
      typeof beforeValue === 'string' &&
      typeof afterValue === 'string' &&
      (beforeValue.length > 50 || afterValue.length > 50)
    ) {
      diff.textDiff = Diff.diffLines(beforeValue || '', afterValue || '');
    }

    diffs.push(diff);
  }

  return diffs;
}

/**
 * Get only changed fields as a set object for update
 */
export function getChangedFields(
  before: Record<string, any>,
  after: Record<string, any>
): Record<string, any> {
  const changed: Record<string, any> = {};

  for (const key of Object.keys(after)) {
    if (!isEqual(before[key], after[key])) {
      changed[key] = after[key];
    }
  }

  return changed;
}

/**
 * Simple equality check
 */
function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  // For objects, do deep comparison
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}

/**
 * Format value for display
 */
export function formatValue(value: any): string {
  if (value == null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
