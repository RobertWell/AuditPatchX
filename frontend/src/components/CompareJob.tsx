import { useState } from 'react';
import { Play, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { CompareJobRequest } from '../types/api';

interface CompareJobProps {
  onStartReview: (config: CompareJobRequest) => void;
}

export function CompareJob({ onStartReview }: CompareJobProps) {
  const [tableOne, setTableOne] = useState('schema1.table1');
  const [tableTwo, setTableTwo] = useState('schema2.table2');
  const [syncPk, setSyncPk] = useState('id, company_id');
  const [ignoreColumn, setIgnoreColumn] = useState('update_time, modified_by');
  const [limit, setLimit] = useState(100);

  const handleRun = () => {
    onStartReview({
      tableOne,
      tableTwo,
      syncPk: syncPk.split(',').map(s => s.trim()).filter(Boolean),
      ignoreColumns: ignoreColumn.split(',').map(s => s.trim()).filter(Boolean),
      limit
    });
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      <div className="max-w-4xl">
        <h1 className="mb-6">Table Comparison Setup</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Sync Specification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Table One</Label>
                <input
                  type="text"
                  placeholder="schema1.table1"
                  value={tableOne}
                  onChange={(e) => setTableOne(e.target.value)}
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Table Two</Label>
                <input
                  type="text"
                  placeholder="schema2.table2"
                  value={tableTwo}
                  onChange={(e) => setTableTwo(e.target.value)}
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Sync PK</Label>
                <input
                  type="text"
                  placeholder="id, company_id (comma separated)"
                  value={syncPk}
                  onChange={(e) => setSyncPk(e.target.value)}
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Ignore Column</Label>
                <input
                  type="text"
                  placeholder="update_time, modified_by"
                  value={ignoreColumn}
                  onChange={(e) => setIgnoreColumn(e.target.value)}
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Limit num for sync</Label>
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleRun} size="lg" className="gap-2">
            <Play className="w-4 h-4" />
            Run Comparison
          </Button>
        </div>
      </div>
    </div>
  );
}
