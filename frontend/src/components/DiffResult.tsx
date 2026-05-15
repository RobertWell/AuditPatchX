import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, RefreshCw, Filter, AlertTriangle } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';

interface DiffRow {
  pk: string;
  status: 'INSERT' | 'UPDATE' | 'DELETE' | 'CONFLICT' | 'IGNORED';
  changedColumns: number;
  updatedBy: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  changes: {
    column: string;
    sourceValue: string;
    targetValue: string;
    isLongText: boolean;
  }[];
}

interface DiffResultProps {
  onOpenSqlReview: (row: DiffRow, column: string) => void;
}

export function DiffResult({ onOpenSqlReview }: DiffResultProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const allColumns = [
    'SQL_DEFINITION',
    'RULE_TYPE',
    'RULE_NAME',
    'DESCRIPTION',
    'VALIDATION_PROCEDURE',
    'ERROR_MESSAGE',
    'PRIORITY',
    'IS_ACTIVE',
    'CONFIG_JSON',
    'NOTES'
  ];

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(['SQL_DEFINITION', 'RULE_TYPE', 'VALIDATION_PROCEDURE'])
  );

  const toggleColumn = (column: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(column)) {
      newVisible.delete(column);
    } else {
      newVisible.add(column);
    }
    setVisibleColumns(newVisible);
  };

  const mockData: DiffRow[] = [
    {
      pk: 'RULE_001',
      status: 'UPDATE',
      changedColumns: 3,
      updatedBy: 'john.doe',
      reviewStatus: 'PENDING',
      changes: [
        {
          column: 'SQL_DEFINITION',
          sourceValue: 'SELECT * FROM users WHERE status = \'ACTIVE\' AND created_date > SYSDATE - 30',
          targetValue: 'SELECT u.*, d.department_name FROM users u LEFT JOIN departments d ON u.dept_id = d.id WHERE u.status = \'ACTIVE\' AND u.created_date > SYSDATE - 30 ORDER BY u.created_date DESC',
          isLongText: true
        },
        {
          column: 'RULE_TYPE',
          sourceValue: 'SIMPLE',
          targetValue: 'COMPLEX',
          isLongText: false
        },
        {
          column: 'DESCRIPTION',
          sourceValue: 'Basic user query',
          targetValue: 'Enhanced user query with department info',
          isLongText: false
        }
      ]
    },
    {
      pk: 'RULE_002',
      status: 'UPDATE',
      changedColumns: 1,
      updatedBy: 'jane.smith',
      reviewStatus: 'PENDING',
      changes: [
        {
          column: 'VALIDATION_PROCEDURE',
          sourceValue: 'CREATE OR REPLACE PROCEDURE validate_input(p_value VARCHAR2) IS BEGIN IF p_value IS NULL THEN RAISE_APPLICATION_ERROR(-20001, \'Invalid input\'); END IF; END;',
          targetValue: 'CREATE OR REPLACE PROCEDURE validate_input(p_value VARCHAR2, p_type VARCHAR2 DEFAULT \'STRING\') IS BEGIN IF p_value IS NULL THEN RAISE_APPLICATION_ERROR(-20001, \'Invalid input\'); END IF; IF p_type = \'EMAIL\' AND NOT REGEXP_LIKE(p_value, \'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}$\') THEN RAISE_APPLICATION_ERROR(-20002, \'Invalid email format\'); END IF; END;',
          isLongText: true
        }
      ]
    },
    {
      pk: 'RULE_003',
      status: 'INSERT',
      changedColumns: 5,
      updatedBy: 'system',
      reviewStatus: 'PENDING',
      changes: []
    }
  ];

  const toggleRow = (pk: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(pk)) {
      newExpanded.delete(pk);
    } else {
      newExpanded.add(pk);
    }
    setExpandedRows(newExpanded);
  };

  const toggleSelectRow = (pk: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(pk)) {
      newSelected.delete(pk);
    } else {
      newSelected.add(pk);
    }
    setSelectedRows(newSelected);
  };

  const getStatusBadge = (status: DiffRow['status']) => {
    const variants = {
      INSERT: { variant: 'default' as const, icon: Plus, color: 'text-green-600 bg-green-50 border-green-200' },
      UPDATE: { variant: 'secondary' as const, icon: RefreshCw, color: 'text-blue-600 bg-blue-50 border-blue-200' },
      DELETE: { variant: 'destructive' as const, icon: Trash2, color: 'text-red-600 bg-red-50 border-red-200' },
      CONFLICT: { variant: 'destructive' as const, icon: AlertTriangle, color: 'text-orange-600 bg-orange-50 border-orange-200' },
      IGNORED: { variant: 'outline' as const, icon: RefreshCw, color: 'text-gray-600 bg-gray-50 border-gray-200' }
    };
    const config = variants[status];
    const Icon = config.icon;
    return (
      <Badge className={cn('gap-1', config.color)}>
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1>Comparison Results</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Found {mockData.length} differences • {selectedRows.size} selected
          </p>
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                Columns ({visibleColumns.size}/{allColumns.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-2">
                <h4 className="mb-3">Select Columns to Compare</h4>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {allColumns.map((col) => (
                    <div key={col} className="flex items-center gap-2">
                      <Checkbox
                        id={`col-${col}`}
                        checked={visibleColumns.has(col)}
                        onCheckedChange={() => toggleColumn(col)}
                      />
                      <label
                        htmlFor={`col-${col}`}
                        className="text-sm font-mono cursor-pointer flex-1"
                      >
                        {col}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline">Export SQL</Button>
          <Button disabled={selectedRows.size === 0}>
            Review Selected ({selectedRows.size})
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="w-10 p-3"></th>
                <th className="w-10 p-3">
                  <Checkbox />
                </th>
                <th className="text-left p-3">Primary Key</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Changed</th>
                <th className="text-left p-3">Updated By</th>
                <th className="text-left p-3">Review</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockData.map((row) => {
                const isExpanded = expandedRows.has(row.pk);
                const isSelected = selectedRows.has(row.pk);
                return (
                  <>
                    <tr key={row.pk} className={cn(
                      "border-b hover:bg-muted/30 transition-colors",
                      isSelected && "bg-primary/5"
                    )}>
                      <td className="p-3">
                        <button
                          onClick={() => toggleRow(row.pk)}
                          className="hover:bg-muted rounded p-1"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectRow(row.pk)}
                        />
                      </td>
                      <td className="p-3 font-mono text-sm">{row.pk}</td>
                      <td className="p-3">{getStatusBadge(row.status)}</td>
                      <td className="p-3">
                        <span className="text-sm">{row.changedColumns} columns</span>
                      </td>
                      <td className="p-3 text-sm">{row.updatedBy}</td>
                      <td className="p-3">
                        <Badge variant="outline">{row.reviewStatus}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost">Approve</Button>
                          <Button size="sm" variant="ghost">Reject</Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/20">
                        <td colSpan={8} className="p-0">
                          <div className="p-4 space-y-3">
                            {row.changes
                              .filter(change => visibleColumns.has(change.column))
                              .map((change) => (
                                <div key={change.column} className="border rounded-lg p-3 bg-background">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-mono text-sm">{change.column}</span>
                                    {change.isLongText && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onOpenSqlReview(row, change.column)}
                                      >
                                        Deep Review
                                      </Button>
                                    )}
                                  </div>
                                  {!change.isLongText ? (
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <div className="text-xs text-muted-foreground mb-1">Source</div>
                                        <div className="font-mono bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded">
                                          {change.sourceValue}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground mb-1">Target</div>
                                        <div className="font-mono bg-green-50 dark:bg-green-950/20 px-2 py-1 rounded">
                                          {change.targetValue}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground">
                                      Long SQL content • Click "Deep Review" to compare
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
