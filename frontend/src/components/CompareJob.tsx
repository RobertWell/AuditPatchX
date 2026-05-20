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

  const applyPair = (pair: SyncPairConfigInfo) => {
    setSelectedPairName(pair.pairName);
    setTableOne(pair.tableA);
    setTableTwo(pair.tableB);
    setSyncPk(pair.pkColumns.join(', '));
    setIgnoreColumn(pair.excludeColumns.join(', '));
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
    onStartReview({
      tableOne,
      tableTwo,
      syncPk: syncPk.split(',').map(s => s.trim()).filter(Boolean),
      ignoreColumns: ignoreColumn.split(',').map(s => s.trim()).filter(Boolean),
      limit
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
                  onChange={(e) => setSyncPk(e.target.value)}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
