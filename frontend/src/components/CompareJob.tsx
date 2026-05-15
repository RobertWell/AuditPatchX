import { Play, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';

interface CompareJobProps {
  onStartReview: () => void;
}

export function CompareJob({ onStartReview }: CompareJobProps) {
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
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Table Two</Label>
                <input
                  type="text"
                  placeholder="schema2.table2"
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Sync PK</Label>
                <input
                  type="text"
                  placeholder="id, company_id (comma separated)"
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Ignore Column</Label>
                <input
                  type="text"
                  placeholder="update_time, modified_by"
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>

              <div>
                <Label>Limit num for sync</Label>
                <input
                  type="number"
                  defaultValue={100}
                  className="w-full px-3 py-2 mt-1 border border-input rounded-md bg-input-background"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={onStartReview} size="lg" className="gap-2">
            <Play className="w-4 h-4" />
            Run Comparison
          </Button>
        </div>
      </div>
    </div>
  );
}
