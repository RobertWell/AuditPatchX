import { History, RotateCcw, Download, Eye } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function SyncHistory() {
  const historyData = [
    {
      id: 'SYNC_001',
      timestamp: '2026-05-15 09:30:00',
      source: 'PROD_DB1.APP_SCHEMA.CONFIG_RULES',
      target: 'UAT_DB1.APP_SCHEMA.CONFIG_RULES',
      rowsAffected: 15,
      columnsChanged: 45,
      reviewer: 'john.doe',
      status: 'COMPLETED',
      canRollback: true
    },
    {
      id: 'SYNC_002',
      timestamp: '2026-05-14 16:45:00',
      source: 'PROD_DB1.APP_SCHEMA.WORKFLOW_DEF',
      target: 'UAT_DB1.APP_SCHEMA.WORKFLOW_DEF',
      rowsAffected: 8,
      columnsChanged: 12,
      reviewer: 'jane.smith',
      status: 'COMPLETED',
      canRollback: true
    },
    {
      id: 'SYNC_003',
      timestamp: '2026-05-14 14:20:00',
      source: 'UAT_DB1.APP_SCHEMA.STORED_PROCEDURES',
      target: 'PROD_DB1.APP_SCHEMA.STORED_PROCEDURES',
      rowsAffected: 3,
      columnsChanged: 3,
      reviewer: 'admin',
      status: 'FAILED',
      canRollback: false
    }
  ];

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      <div className="max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2">
              <History className="w-6 h-6" />
              Synchronization History
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track all database synchronization operations
            </p>
          </div>
          <Button variant="outline">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>

        <div className="space-y-4">
          {historyData.map((sync) => (
            <Card key={sync.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="font-mono">{sync.id}</CardTitle>
                    <Badge
                      variant={sync.status === 'COMPLETED' ? 'default' : 'destructive'}
                    >
                      {sync.status}
                    </Badge>
                    {sync.canRollback && (
                      <Badge variant="outline" className="text-blue-600 border-blue-200">
                        Rollback Available
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{sync.timestamp}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6 mb-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Source</div>
                    <div className="font-mono text-sm bg-blue-50 dark:bg-blue-950/20 px-3 py-2 rounded border border-blue-200">
                      {sync.source}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Target</div>
                    <div className="font-mono text-sm bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded border border-green-200">
                      {sync.target}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="p-3 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground mb-1">Rows Affected</div>
                    <div className="font-semibold">{sync.rowsAffected}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground mb-1">Columns Changed</div>
                    <div className="font-semibold">{sync.columnsChanged}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground mb-1">Reviewer</div>
                    <div className="font-semibold">{sync.reviewer}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                    <div className="font-semibold">{sync.status}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    <Eye className="w-4 h-4" />
                    View Details
                  </Button>
                  {sync.canRollback && (
                    <Button size="sm" variant="outline">
                      <RotateCcw className="w-4 h-4" />
                      Rollback
                    </Button>
                  )}
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4" />
                    Download SQL
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
