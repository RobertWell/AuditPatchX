import { useEffect, useState } from 'react';
import { Play, ArrowRightLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CompareJobRequest, SyncPairConfigInfo } from '../types/api';
import apiClient from '../services/api';

interface CompareJobProps {
  onStartReview: (config: CompareJobRequest) => void;
  onConfigChange?: () => void;
}

export function CompareJob({ onStartReview, onConfigChange }: CompareJobProps) {
  const [tableOne, setTableOne] = useState('');
  const [tableTwo, setTableTwo] = useState('');
  const [syncPk, setSyncPk] = useState('');
  const [ignoreColumn, setIgnoreColumn] = useState('');
  const [limit, setLimit] = useState(100);
  const [syncPairs, setSyncPairs] = useState<SyncPairConfigInfo[]>([]);
  const [selectedPairName, setSelectedPairName] = useState('');
  const [configLoading, setConfigLoading] = useState(true);
  // PK filter: one entry per parsed PK column, value = filter string (blank = wildcard)
  const [pkFilter, setPkFilter] = useState<Record<string, string>>({});

  // Parse the syncPk string into an ordered list of column names
  const parsedPks = syncPk.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  const applyPair = (pair: SyncPairConfigInfo) => {
    setSelectedPairName(pair.pairName);
    setTableOne(pair.tableA);
    setTableTwo(pair.tableB);
    setSyncPk(pair.pkColumns.join(', '));
    setIgnoreColumn(pair.excludeColumns.join(', '));
    setPkFilter({});
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const pairs = await apiClient.getCompareConfig();
        setSyncPairs(pairs);
        if (pairs.length > 0) {
          applyPair(pairs[0]);
        }
      } catch {
        // Keep manual input mode if compare config API is unavailable.
      } finally {
        setConfigLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handlePairChange = (pairName: string) => {
    const pair = syncPairs.find(item => item.pairName === pairName);
    if (pair) {
      applyPair(pair);
    }
  };

  const handleRun = () => {
    // Strip blank filter entries before sending — blank = wildcard, not included
    const activeFilter = Object.fromEntries(
      Object.entries(pkFilter).filter(([, v]) => v.trim() !== '')
    );
    onStartReview({
      tableOne,
      tableTwo,
      syncPk: syncPk.split(',').map(s => s.trim()).filter(Boolean),
      ignoreColumns: ignoreColumn.split(',').map(s => s.trim()).filter(Boolean),
      limit,
      ...(Object.keys(activeFilter).length > 0 ? { pkFilter: activeFilter } : {}),
    });
  };

  const handleSwap = () => {
    if (!tableOne && !tableTwo) return;
    const temp = tableOne;
    setTableOne(tableTwo);
    setTableTwo(temp);
    onConfigChange?.();
  };

  const canRun = tableOne.trim() !== '' && tableTwo.trim() !== '' && syncPk.trim() !== '';

  return (
    <div className="p-6 pb-4 w-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Comparison Configuration</h2>
          <span className="text-xs text-muted-foreground">Configured pairs: {configLoading ? 'Loading' : syncPairs.length}</span>
          <Button onClick={handleRun} size="sm" className="gap-2" disabled={!canRun}>
            <Play className="w-4 h-4" />
            Run Comparison
          </Button>
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Sync Specification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-4">
            {(configLoading || syncPairs.length > 0) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label className="text-xs font-semibold uppercase tracking-normal text-amber-800 dark:text-amber-200">Selected Pair</Label>
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    {configLoading ? 'Loading config' : `${syncPairs.length} configured`}
                  </span>
                </div>
                <Select value={selectedPairName} onValueChange={handlePairChange}>
                  <SelectTrigger className="h-10 border-amber-400 bg-background font-medium shadow-sm dark:border-amber-700" disabled={configLoading}>
                    <SelectValue placeholder={configLoading ? 'Loading configured pairs' : 'Select a configured pair'} />
                  </SelectTrigger>
                  <SelectContent>
                    {syncPairs.map(pair => (
                      <SelectItem key={pair.pairName} value={pair.pairName}>
                        {pair.pairName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-end">
              <div className="min-w-0">
                <Label className="text-xs">Table One (Source)</Label>
                <Input
                  type="text"
                  placeholder=""
                  value={tableOne}
                  onChange={(e) => setTableOne(e.target.value)}
                  className="mt-1 bg-input-background font-mono text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="mb-[2px] h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={handleSwap}
                title="Reverse Sync Direction"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <Label className="text-xs">Table Two (Target)</Label>
                <Input
                  type="text"
                  placeholder=""
                  value={tableTwo}
                  onChange={(e) => setTableTwo(e.target.value)}
                  className="mt-1 bg-input-background font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label className="text-xs">Sync PK</Label>
                <Input
                  type="text"
                  placeholder=""
                  value={syncPk}
                  onChange={(e) => { setSyncPk(e.target.value); setPkFilter({}); }}
                  className="mt-1 bg-input-background"
                />
              </div>

              <div>
                <Label className="text-xs">Ignore Column</Label>
                <Input
                  type="text"
                  placeholder=""
                  value={ignoreColumn}
                  onChange={(e) => setIgnoreColumn(e.target.value)}
                  className="mt-1 bg-input-background"
                />
                {ignoreColumn.trim() !== '' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ignored during diff display; still copied on approve.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">Limit</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
                  className="mt-1 bg-input-background"
                />
              </div>
            </div>

            {/* PK Filter — one optional input per PK column; blank = match all */}
            {parsedPks.length > 0 && (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    PK Filter
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    — fill any column to narrow results; leave blank to match all
                  </span>
                  {Object.values(pkFilter).some(v => v.trim()) && (
                    <button
                      className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => setPkFilter({})}
                    >
                      clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {parsedPks.map(col => (
                    <div key={col} className="flex flex-col gap-1 min-w-[140px]">
                      <Label className="text-xs text-muted-foreground">{col}</Label>
                      <Input
                        type="text"
                        placeholder="any"
                        value={pkFilter[col] ?? ''}
                        onChange={e => setPkFilter(prev => ({ ...prev, [col]: e.target.value }))}
                        className="h-8 bg-input-background font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
