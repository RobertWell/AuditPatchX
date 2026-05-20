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
}

export function CompareJob({ onStartReview }: CompareJobProps) {
  const [tableOne, setTableOne] = useState('schema1.table1');
  const [tableTwo, setTableTwo] = useState('schema2.table2');
  const [syncPk, setSyncPk] = useState('id, company_id');
  const [ignoreColumn, setIgnoreColumn] = useState('update_time, modified_by');
  const [limit, setLimit] = useState(100);
  const [syncPairs, setSyncPairs] = useState<SyncPairConfigInfo[]>([]);
  const [selectedPairName, setSelectedPairName] = useState('');

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
    const temp = tableOne;
    setTableOne(tableTwo);
    setTableTwo(temp);
    setSelectedPairName('');
  };

  return (
    <div className="p-6 pb-4 w-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Comparison Configuration</h2>
          <span className="text-xs text-muted-foreground">Configured pairs: {syncPairs.length}</span>
          <Button onClick={handleRun} size="sm" className="gap-2">
            <Play className="w-4 h-4" />
            Run Comparison
          </Button>
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Sync Specification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-4">
            {syncPairs.length > 0 && (
              <div>
                <Label className="text-xs">Configured Pair</Label>
                <Select value={selectedPairName} onValueChange={handlePairChange}>
                  <SelectTrigger className="mt-1 bg-input-background">
                    <SelectValue placeholder="Select a configured pair" />
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="md:col-span-2 flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Table One (Source)</Label>
                  <Input
                    type="text"
                    placeholder="schema1.table1"
                    value={tableOne}
                    onChange={(e) => setTableOne(e.target.value)}
                    className="mt-1 bg-input-background"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0 mb-[2px] h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={handleSwap}
                  title="Reverse Sync Direction"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1">
                  <Label className="text-xs">Table Two (Target)</Label>
                  <Input
                    type="text"
                    placeholder="schema2.table2"
                    value={tableTwo}
                    onChange={(e) => setTableTwo(e.target.value)}
                    className="mt-1 bg-input-background"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Sync PK</Label>
                <Input
                  type="text"
                  placeholder="id, company_id"
                  value={syncPk}
                  onChange={(e) => setSyncPk(e.target.value)}
                  className="mt-1 bg-input-background"
                />
              </div>

              <div>
                <Label className="text-xs">Ignore Column</Label>
                <Input
                  type="text"
                  placeholder="update_time"
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
