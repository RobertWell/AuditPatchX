import { useState } from 'react';
import { X, Check, XCircle, MessageSquare, Eye, AlignLeft, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';
import { buildSqlReviewDiff, summarizeSqlReviewDiff } from '../services/sqlReviewDiff';

interface SqlReviewPanelProps {
  onClose: () => void;
  rowId: string;
  column: string;
  sourceValue: string;
  targetValue: string;
  onSubmitReview: (review: {
    rowId: string;
    column: string;
    decision: 'approved' | 'rejected';
    comment: string;
  }) => void;
}

export function SqlReviewPanel({
  onClose,
  rowId,
  column,
  sourceValue,
  targetValue,
  onSubmitReview
}: SqlReviewPanelProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [comment, setComment] = useState('');

  const diffLines = buildSqlReviewDiff(sourceValue, targetValue);
  const visibleLines = showUnchanged ? diffLines : diffLines.filter(l => l.type !== 'unchanged');
  const { addedLines, removedLines, modifiedLines, changedLines } = summarizeSqlReviewDiff(diffLines);

  const riskFactors = [
    { label: 'Long Text', level: 'LOW' },
    { label: `${changedLines} Changed Lines`, level: changedLines > 5 ? 'MEDIUM' : 'LOW' },
    { label: 'Manual Review', level: 'MEDIUM' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background border rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        <div className="border-b p-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2>Deep SQL Review</h2>
              <Badge variant="outline" className="font-mono">{rowId}</Badge>
              <Badge variant="secondary">{column}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {riskFactors.map((risk) => (
                <Badge
                  key={risk.label}
                  className={cn(
                    risk.level === 'HIGH' && 'bg-red-50 text-red-700 border-red-200',
                    risk.level === 'MEDIUM' && 'bg-orange-50 text-orange-700 border-orange-200',
                    risk.level === 'LOW' && 'bg-blue-50 text-blue-700 border-blue-200'
                  )}
                >
                  {risk.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === 'split' ? 'default' : 'outline'}
              onClick={() => setViewMode('split')}
            >
              <AlignLeft className="w-4 h-4" />
              Split
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'unified' ? 'default' : 'outline'}
              onClick={() => setViewMode('unified')}
            >
              <Eye className="w-4 h-4" />
              Unified
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUnchanged(!showUnchanged)}
            >
              {showUnchanged ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              {showUnchanged ? 'Hide' : 'Show'} Unchanged
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-hidden">
            {viewMode === 'split' ? (
              <div className="h-full grid grid-cols-2 divide-x">
                <div className="overflow-hidden flex flex-col">
                  <div className="bg-red-50 dark:bg-red-950/20 px-4 py-2 border-b text-sm flex items-center gap-2">
                    <Badge variant="outline" className="bg-background">Source</Badge>
                    <span className="text-muted-foreground">{rowId}</span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="font-mono text-sm">
                      {visibleLines.map((line, idx) => {
                        if (!line.sourceLine && line.type === 'added') return null;
                        return (
                          <div
                            key={idx}
                            className={cn(
                              'flex',
                              line.type === 'removed' && 'bg-red-50 dark:bg-red-950/30',
                              line.type === 'modified' && 'bg-orange-50 dark:bg-orange-950/20'
                            )}
                          >
                            <div className="w-12 text-right pr-3 py-1 text-muted-foreground select-none border-r">
                              {line.sourceLineNum || ''}
                            </div>
                            <div className="flex-1 px-3 py-1 whitespace-pre">
                              {line.sourceLine || ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                <div className="overflow-hidden flex flex-col">
                  <div className="bg-green-50 dark:bg-green-950/20 px-4 py-2 border-b text-sm flex items-center gap-2">
                    <Badge variant="outline" className="bg-background">Target</Badge>
                    <span className="text-muted-foreground">{rowId}</span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="font-mono text-sm">
                      {visibleLines.map((line, idx) => {
                        if (!line.targetLine && line.type === 'removed') return null;
                        return (
                          <div
                            key={idx}
                            className={cn(
                              'flex',
                              line.type === 'added' && 'bg-green-50 dark:bg-green-950/30',
                              line.type === 'modified' && 'bg-orange-50 dark:bg-orange-950/20'
                            )}
                          >
                            <div className="w-12 text-right pr-3 py-1 text-muted-foreground select-none border-r">
                              {line.targetLineNum || ''}
                            </div>
                            <div className="flex-1 px-3 py-1 whitespace-pre">
                              {line.targetLine || ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="font-mono text-sm">
                  {visibleLines.map((line, idx) => (
                    <div key={idx}>
                      {line.type === 'removed' && (
                        <div className="flex bg-red-50 dark:bg-red-950/30">
                          <div className="w-12 text-right pr-3 py-1 text-muted-foreground select-none border-r">
                            {line.sourceLineNum}
                          </div>
                          <div className="w-6 px-2 py-1 text-red-600 select-none">-</div>
                          <div className="flex-1 px-3 py-1 whitespace-pre">{line.sourceLine}</div>
                        </div>
                      )}
                      {line.type === 'added' && (
                        <div className="flex bg-green-50 dark:bg-green-950/30">
                          <div className="w-12 text-right pr-3 py-1 text-muted-foreground select-none border-r">
                            {line.targetLineNum}
                          </div>
                          <div className="w-6 px-2 py-1 text-green-600 select-none">+</div>
                          <div className="flex-1 px-3 py-1 whitespace-pre">{line.targetLine}</div>
                        </div>
                      )}
                      {line.type === 'unchanged' && (
                        <div className="flex">
                          <div className="w-12 text-right pr-3 py-1 text-muted-foreground select-none border-r">
                            {line.sourceLineNum}
                          </div>
                          <div className="w-6 px-2 py-1 select-none"> </div>
                          <div className="flex-1 px-3 py-1 whitespace-pre">{line.sourceLine}</div>
                        </div>
                      )}
                      {line.type === 'modified' && (
                        <>
                          <div className="flex bg-red-50 dark:bg-red-950/30">
                            <div className="w-12 text-right pr-3 py-1 text-muted-foreground select-none border-r">
                              {line.sourceLineNum}
                            </div>
                            <div className="w-6 px-2 py-1 text-red-600 select-none">-</div>
                            <div className="flex-1 px-3 py-1 whitespace-pre">{line.sourceLine}</div>
                          </div>
                          <div className="flex bg-green-50 dark:bg-green-950/30">
                            <div className="w-12 text-right pr-3 py-1 text-muted-foreground select-none border-r">
                              {line.targetLineNum}
                            </div>
                            <div className="w-6 px-2 py-1 text-green-600 select-none">+</div>
                            <div className="flex-1 px-3 py-1 whitespace-pre">{line.targetLine}</div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="w-80 border-l bg-muted/20 flex flex-col">
            <div className="p-4 border-b">
              <h3 className="mb-3">Review Decision</h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant={decision === 'approved' ? 'default' : 'outline'}
                  onClick={() => setDecision('approved')}
                  className="justify-start gap-2"
                >
                  <Check className="w-4 h-4" />
                  Approve Change
                </Button>
                <Button
                  variant={decision === 'rejected' ? 'destructive' : 'outline'}
                  onClick={() => setDecision('rejected')}
                  className="justify-start gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Change
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Comments
                  </h4>
                  <Textarea
                    placeholder="Add review comments..."
                    className="min-h-24"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </div>

                <div>
                  <h4 className="mb-2">Analysis</h4>
                  <div className="space-y-2 text-sm">
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Lines Added</div>
                      <div className="font-mono">+{addedLines + modifiedLines}</div>
                    </div>
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Lines Removed</div>
                      <div className="font-mono">-{removedLines + modifiedLines}</div>
                    </div>
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Complexity</div>
                      <div className="font-mono">{changedLines > 5 ? 'Medium' : 'Low'}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2">SQL Changes Detected</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>{addedLines} added line(s)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span>{removedLines} removed line(s)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>{modifiedLines} modified line(s)</span>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="p-4 border-t space-y-2">
              <Button
                className="w-full"
                disabled={!decision}
                onClick={() => {
                  if (!decision) return;
                  onSubmitReview({ rowId, column, decision, comment });
                }}
              >
                Submit Review
              </Button>
              <Button variant="outline" className="w-full" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
