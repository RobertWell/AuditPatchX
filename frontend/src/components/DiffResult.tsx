import { Fragment, useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, RefreshCw, Filter, AlertTriangle } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { CompareJobDiffRow } from '../types/api';
import {
  getReviewTargetColumn,
  getSelectionState,
  setAllSelection,
  toggleSelection,
} from './diffResultSelection';

interface DiffResultProps {
  data: CompareJobDiffRow[];
  onOpenSqlReview: (row: CompareJobDiffRow, column: string) => void;
  onReviewSelected?: (row: CompareJobDiffRow, column: string) => void;
  onBulkApproveSelected?: (selectedRows: CompareJobDiffRow[]) => void;
}

export function DiffResult({
  data,
  onOpenSqlReview,
  onReviewSelected,
  onBulkApproveSelected,
}: DiffResultProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const allColumns = Array.from(new Set(
    data.flatMap(row => row.changes.map(change => change.column))
  ));

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns));

  // Update visible columns if data changes and introduces new columns
  useEffect(() => {
    setVisibleColumns(prev => {
      const newVisible = new Set(prev);
      allColumns.forEach(col => newVisible.add(col));
      return newVisible;
    });
  }, [data]);

  useEffect(() => {
    setSelectedRows((prev) => {
      const next = new Set(Array.from(prev).filter((pk) => data.some((row) => row.pk === pk)));
      return next.size === prev.size ? prev : next;
    });
  }, [data]);

  const toggleColumn = (column: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(column)) {
      newVisible.delete(column);
    } else {
      newVisible.add(column);
    }
    setVisibleColumns(newVisible);
  };

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
    setSelectedRows((current) => toggleSelection(current, pk));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedRows(setAllSelection(data, checked));
  };

  const selectedRowData = data.filter((row) => selectedRows.has(row.pk));
  const selectionState = getSelectionState(data.length, selectedRows.size);
  const singleSelection = selectedRowData.length === 1 ? selectedRowData[0] : null;
  const singleReviewColumn = singleSelection ? getReviewTargetColumn(singleSelection) : null;

  const handleReviewSelected = () => {
    if (!singleSelection || !singleReviewColumn) return;
    onReviewSelected?.(singleSelection, singleReviewColumn);
  };

  const handleBulkApproveSelected = () => {
    if (selectedRowData.length <= 1) return;
    onBulkApproveSelected?.(selectedRowData);
  };

  const getStatusBadge = (status: CompareJobDiffRow['status']) => {
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
            Found {data.length} differences • {selectedRows.size} selected
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
          <Button
            disabled={!selectionState.canReviewSingle || !singleSelection || !singleReviewColumn}
            onClick={handleReviewSelected}
          >
            Review Selected ({selectedRows.size})
          </Button>
          <Button
            disabled={!selectionState.canBulkApprove}
            onClick={handleBulkApproveSelected}
            variant="secondary"
          >
            Approve Selected ({selectedRows.size})
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
                  <Checkbox
                    aria-label="Select all rows"
                    checked={selectionState.checked ? true : selectionState.indeterminate ? 'indeterminate' : false}
                    onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                  />
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
              {data.map((row) => {
                const isExpanded = expandedRows.has(row.pk);
                const isSelected = selectedRows.has(row.pk);
                return (
                  <Fragment key={row.pk}>
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
                          aria-label={`Select row ${row.pk}`}
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
