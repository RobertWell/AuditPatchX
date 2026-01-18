import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, Drawer, Form, Input, Modal, Space, Switch, Tabs } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  EditorView,
  type ViewUpdate,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { computeDiff, formatValue, type FieldDiff } from '../services/diffUtils';
import type { TableMetadataResponse } from '../types/api';

interface DiffViewProps {
  before: Record<string, any>;
  after: Record<string, any>;
  onAfterChange: (after: Record<string, any>) => void;
  onApprove: () => void;
  onReject: () => void;
  pkColumns: string[];
  metadata: TableMetadataResponse | null;
}

const mergeVSCodeLightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#ffffff',
      height: '100%',
    },
    '.cm-mergeView, .cm-mergeViewEditors, .cm-mergeViewEditor': {
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: "'Monaco','Menlo','Ubuntu Mono',monospace",
      fontSize: '12px',
    },
    '.cm-merge-a .cm-changedLine, .cm-merge-a .cm-deletedChunk': {
      backgroundColor: 'rgba(207,34,46,0.14)',
      borderLeft: '4px solid rgba(207,34,46,0.88)',
      boxShadow: 'inset 0 0 0 1px rgba(207,34,46,0.18)',
    },
    '.cm-merge-b .cm-changedLine': {
      backgroundColor: 'rgba(26,127,55,0.14)',
      borderLeft: '4px solid rgba(26,127,55,0.88)',
      boxShadow: 'inset 0 0 0 1px rgba(26,127,55,0.18)',
    },
    '.cm-merge-a .cm-changedText, .cm-merge-a .cm-deletedText': {
      backgroundColor: 'rgba(207,34,46,0.55)',
      color: '#6e0c0c',
      borderRadius: '3px',
      padding: '0 3px',
      fontWeight: '700',
      boxShadow: 'inset 0 -2px 0 rgba(207,34,46,0.95), inset 0 0 0 1px rgba(207,34,46,0.25)',
    },
    '.cm-merge-b .cm-changedText': {
      backgroundColor: 'rgba(26,127,55,0.55)',
      color: '#0b3d1b',
      borderRadius: '3px',
      padding: '0 3px',
      fontWeight: '700',
      boxShadow: 'inset 0 -2px 0 rgba(26,127,55,0.95), inset 0 0 0 1px rgba(26,127,55,0.25)',
    },
    '.cm-merge-b .cm-inlineChangedLine': {
      backgroundColor: 'rgba(26,127,55,0.14)',
      borderLeft: '4px solid rgba(26,127,55,0.88)',
      boxShadow: 'inset 0 0 0 1px rgba(26,127,55,0.18)',
    },
    '.cm-merge-b .cm-insertedLine': {
      backgroundColor: 'rgba(26,127,55,0.10)',
      boxShadow: 'inset 0 -2px 0 rgba(26,127,55,0.65)',
    },
    '.cm-merge-a .cm-deletedLine': {
      backgroundColor: 'rgba(207,34,46,0.10)',
      boxShadow: 'inset 0 -2px 0 rgba(207,34,46,0.65)',
    },
    '.cm-mergeSpacer': {
      backgroundColor: 'rgba(0,0,0,0.045)',
      borderLeft: '3px solid rgba(0,0,0,0.16)',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)',
      pointerEvents: 'none',
      userSelect: 'none',
    },
    '.cm-mergeView .cm-gutters': {
      backgroundColor: 'rgba(0,0,0,0.02)',
    },
    '.cm-merge-a .cm-changedLineGutter, .cm-merge-a .cm-deletedLineGutter': {
      backgroundColor: 'rgba(207,34,46,0.88)',
    },
    '.cm-merge-b .cm-changedLineGutter': {
      backgroundColor: 'rgba(26,127,55,0.88)',
    },
  },
  { dark: false }
);

const mergeVSCodeDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0b1220',
      height: '100%',
    },
    '.cm-mergeView, .cm-mergeViewEditors, .cm-mergeViewEditor': {
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: "'Monaco','Menlo','Ubuntu Mono',monospace",
      fontSize: '12px',
    },
    '.cm-merge-a .cm-changedLine, .cm-merge-a .cm-deletedChunk': {
      backgroundColor: 'rgba(248,81,73,0.26)',
      borderLeft: '4px solid rgba(248,81,73,1.0)',
      boxShadow: 'inset 0 0 0 1px rgba(248,81,73,0.22)',
    },
    '.cm-merge-b .cm-changedLine': {
      backgroundColor: 'rgba(46,160,67,0.24)',
      borderLeft: '4px solid rgba(46,160,67,1.0)',
      boxShadow: 'inset 0 0 0 1px rgba(46,160,67,0.22)',
    },
    '.cm-merge-a .cm-changedText, .cm-merge-a .cm-deletedText': {
      backgroundColor: 'rgba(248,81,73,0.72)',
      color: '#ffe3e0',
      borderRadius: '3px',
      padding: '0 3px',
      fontWeight: '700',
      boxShadow: 'inset 0 -2px 0 rgba(248,81,73,1.0), inset 0 0 0 1px rgba(248,81,73,0.28)',
    },
    '.cm-merge-b .cm-changedText': {
      backgroundColor: 'rgba(46,160,67,0.70)',
      color: '#d7ffe0',
      borderRadius: '3px',
      padding: '0 3px',
      fontWeight: '700',
      boxShadow: 'inset 0 -2px 0 rgba(46,160,67,1.0), inset 0 0 0 1px rgba(46,160,67,0.28)',
    },
    '.cm-merge-b .cm-inlineChangedLine': {
      backgroundColor: 'rgba(46,160,67,0.24)',
      borderLeft: '4px solid rgba(46,160,67,1.0)',
      boxShadow: 'inset 0 0 0 1px rgba(46,160,67,0.22)',
    },
    '.cm-merge-b .cm-insertedLine': {
      backgroundColor: 'rgba(46,160,67,0.14)',
      boxShadow: 'inset 0 -2px 0 rgba(46,160,67,0.75)',
    },
    '.cm-merge-a .cm-deletedLine': {
      backgroundColor: 'rgba(248,81,73,0.14)',
      boxShadow: 'inset 0 -2px 0 rgba(248,81,73,0.75)',
    },
    '.cm-mergeSpacer': {
      backgroundColor: 'rgba(255,255,255,0.055)',
      borderLeft: '3px solid rgba(255,255,255,0.22)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      pointerEvents: 'none',
      userSelect: 'none',
    },
    '.cm-mergeView .cm-gutters': {
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    '.cm-merge-a .cm-changedLineGutter, .cm-merge-a .cm-deletedLineGutter': {
      backgroundColor: 'rgba(248,81,73,1.0)',
    },
    '.cm-merge-b .cm-changedLineGutter': {
      backgroundColor: 'rgba(46,160,67,1.0)',
    },
  },
  { dark: true }
);

export const DiffView = ({
  before,
  after,
  onAfterChange,
  onApprove,
  onReject,
  pkColumns,
  metadata,
}: DiffViewProps) => {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified' | 'summary'>('side-by-side');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const diffs = useMemo(() => computeDiff(before, after, metadata || undefined), [before, after, metadata]);
  const changedDiffs = useMemo(() => diffs.filter((d) => d.changed), [diffs]);
  const unchangedDiffs = useMemo(() => diffs.filter((d) => !d.changed), [diffs]);

  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  const [inlineField, setInlineField] = useState<string | null>(null);
  const [editTheme, setEditTheme] = useState<'dark' | 'light'>('dark');
  const [isEditorReady, setIsEditorReady] = useState(false);
  const mergeHostRef = useRef<HTMLDivElement | null>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const modifiedValueRef = useRef<string>('');

  const isPk = (field: string) => pkColumns.includes(field);
  const canEdit = (field: string) => !isPk(field);

  const normalize = (value: string) => value.replace(/\r\n/g, '\n');

  const openInlineEditor = (field: string) => {
    if (!canEdit(field)) return;
    setInlineField(field);
    const currentValue = after[field] == null ? '' : String(after[field]);
    modifiedValueRef.current = currentValue;
  };

  const closeInlineEditor = () => {
    setInlineField(null);
    modifiedValueRef.current = '';
  };

  const handleInlineSave = () => {
    if (!inlineField) return;
    const nextValue = modifiedValueRef.current;
    onAfterChange({ ...after, [inlineField]: nextValue });
    closeInlineEditor();
  };

  useEffect(() => {
    if (!isEditorReady || !inlineField || !mergeHostRef.current) return;

    mergeHostRef.current.innerHTML = '';

    const baseExtensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
    ];

    const themeExtensions =
      editTheme === 'dark' ? [oneDark, mergeVSCodeDarkTheme] : [mergeVSCodeLightTheme];

    const readOnly = EditorState.readOnly.of(true);
    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        modifiedValueRef.current = update.state.doc.toString();
      }
    });

    const originalValue = normalize(before[inlineField] == null ? '' : String(before[inlineField]));
    const initialModified = normalize(modifiedValueRef.current);

    const view = new MergeView({
      parent: mergeHostRef.current,
      a: { doc: originalValue, extensions: [...baseExtensions, ...themeExtensions, readOnly] },
      b: { doc: initialModified, extensions: [...baseExtensions, ...themeExtensions, updateListener] },
      gutter: true,
      highlightChanges: true,
    });

    mergeViewRef.current = view;

    return () => {
      mergeViewRef.current?.destroy();
      mergeViewRef.current = null;
    };
  }, [before, editTheme, inlineField, isEditorReady]);

  const handleSyncScroll = (source: 'left' | 'right') => {
    if (syncingRef.current) return;
    const sourceEl = source === 'left' ? leftPaneRef.current : rightPaneRef.current;
    const targetEl = source === 'left' ? rightPaneRef.current : leftPaneRef.current;
    if (!sourceEl || !targetEl) return;
    syncingRef.current = true;
    targetEl.scrollTop = sourceEl.scrollTop;
    syncingRef.current = false;
  };

  const renderLineDiff = (diff: FieldDiff, side: 'before' | 'after') => {
    const lineNodes: ReactNode[] = [];
    diff.textDiff?.forEach((part, partIndex) => {
      if (part.added && side === 'before') return;
      if (part.removed && side === 'after') return;
      const className = part.added ? 'diff-line-added' : part.removed ? 'diff-line-removed-soft' : 'diff-line-neutral';
      const lines = part.value.split('\n');
      lines.forEach((line, lineIndex) => {
        const isLast = lineIndex === lines.length - 1;
        lineNodes.push(
          <div key={`${diff.field}-${side}-${partIndex}-${lineIndex}`} className={className}>
            {line === '' ? ' ' : line}
          </div>
        );
        if (!isLast) lineNodes.push(<div key={`${diff.field}-${side}-${partIndex}-${lineIndex}-nl`} className={className}>{' '}</div>);
      });
    });
    return <div className="diff-lines">{lineNodes}</div>;
  };

  const renderValue = (diff: FieldDiff, side: 'before' | 'after') => {
    const value = side === 'before' ? diff.before : diff.after;
    if (!diff.textDiff || typeof value !== 'string') {
      return <span className="whitespace-pre-wrap break-words">{formatValue(value)}</span>;
    }
    if (diff.textDiffMode === 'lines') return renderLineDiff(diff, side);

    const lineClass = side === 'before' ? 'diff-line-removed-soft' : 'diff-line-added';
    return (
      <span className={`whitespace-pre-wrap break-words diff-inline-line ${lineClass}`}>
        {diff.textDiff.map((part, index) => {
          if (part.added && side === 'before') return null;
          if (part.removed && side === 'after') return null;
          const className = part.added ? 'diff-word-added-strong' : part.removed ? 'diff-word-removed-strong' : '';
          return (
            <span key={`${diff.field}-${side}-${index}`} className={className}>
              {part.value}
            </span>
          );
        })}
      </span>
    );
  };

  const renderClickableValue = (diff: FieldDiff, side: 'before' | 'after') => (
    <div
      onDoubleClick={() => openInlineEditor(diff.field)}
      className={canEdit(diff.field) ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}
      title={canEdit(diff.field) ? 'Double-click to edit' : 'Primary key fields are read-only'}
    >
      {renderValue(diff, side)}
    </div>
  );

  const renderSideBySide = () => (
    <div className="flex gap-2 h-96 overflow-hidden">
      <div className="flex-1 border border-gray-300 rounded bg-gray-50 flex flex-col">
        <div className="bg-gray-700 text-white px-3 py-1 text-xs font-semibold sticky top-0 z-10">
          Before (Current Data)
        </div>
        <div ref={leftPaneRef} onScroll={() => handleSyncScroll('left')} className="flex-1 overflow-auto p-2 diff-view font-mono">
          {diffs.map((diff) => (
            <div key={diff.field} className={`mb-1 p-1 rounded ${diff.changed ? 'diff-row-removed' : ''}`}>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2 items-start">
                <span className="text-blue-700 font-semibold truncate">{diff.field}:</span>
                {renderClickableValue(diff, 'before')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 border border-gray-300 rounded bg-gray-50 flex flex-col">
        <div className="bg-gray-700 text-white px-3 py-1 text-xs font-semibold flex justify-between sticky top-0 z-10">
          <span>After (Proposed Changes)</span>
          <span className="text-green-400">{changedDiffs.length} change{changedDiffs.length !== 1 ? 's' : ''}</span>
        </div>
        <div ref={rightPaneRef} onScroll={() => handleSyncScroll('right')} className="flex-1 overflow-auto p-2 diff-view font-mono">
          {diffs.map((diff) => (
            <div key={diff.field} className={`mb-1 p-1 rounded ${diff.changed ? 'diff-row-added' : ''}`}>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2 items-start">
                <span className="text-blue-700 font-semibold truncate">{diff.field}:</span>
                {renderClickableValue(diff, 'after')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderUnified = () => (
    <div className="h-96 overflow-auto border border-gray-300 rounded bg-gray-50 p-2 diff-view font-mono">
      {diffs.map((diff) => (
        <div key={diff.field} className="mb-2">
          <div className="text-gray-600 font-semibold mb-1">{diff.field}</div>
          {diff.changed ? (
            <>
              <div className="diff-row-removed p-1 rounded mb-1">
                <span className="diff-line-number">-</span>
                {renderValue(diff, 'before')}
              </div>
              <div className="diff-row-added p-1 rounded">
                <span className="diff-line-number">+</span>
                {renderValue(diff, 'after')}
              </div>
            </>
          ) : (
            <div className="p-1">{renderValue(diff, 'before')}</div>
          )}
        </div>
      ))}
    </div>
  );

  const renderSummary = () => (
    <div className="h-96 overflow-auto">
      <div className="mb-4">
        <h4 className="font-semibold text-sm mb-2">Changed Fields ({changedDiffs.length})</h4>
        {changedDiffs.length > 0 ? (
          <div className="space-y-2">
            {changedDiffs.map((diff) => (
              <div key={diff.field} className="border border-gray-300 rounded p-2 bg-white">
                <Badge status="warning" text={<span className="font-semibold">{diff.field}</span>} />
                <div className="ml-6 mt-1 text-xs">
                  <div className="text-red-600">
                    <span className="font-semibold">Before:</span> {renderValue(diff, 'before')}
                  </div>
                  <div className="text-green-600">
                    <span className="font-semibold">After:</span> {renderValue(diff, 'after')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 italic">No changes detected</div>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-sm mb-2">Unchanged Fields ({unchangedDiffs.length})</h4>
        <div className="text-xs text-gray-500">{unchangedDiffs.map((diff) => diff.field).join(', ')}</div>
      </div>
    </div>
  );

  const renderDrawerEditForm = () => (
    <Drawer
      title="Edit Proposed Values"
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      width={420}
      extra={
        <Space>
          <Button onClick={() => setDrawerOpen(false)}>Close</Button>
          <Button
            type="primary"
            onClick={() => {
              onAfterChange(editDraft);
              setDrawerOpen(false);
            }}
          >
            Save
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {Object.keys(after)
          .filter((key) => !isPk(key))
          .map((key) => (
            <Form.Item key={key} label={key}>
              <Input.TextArea
                value={editDraft[key] ?? ''}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={2}
              />
            </Form.Item>
          ))}
      </Form>
    </Drawer>
  );

  const [editDraft, setEditDraft] = useState<Record<string, any>>(after);
  useEffect(() => setEditDraft(after), [after]);

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Diff View</span>
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => setDrawerOpen(true)}>
              Edit Proposed
            </Button>
          </Space>
        </div>
      }
      size="small"
      className="h-full"
    >
      <Tabs
        activeKey={viewMode}
        onChange={(key) => setViewMode(key as any)}
        size="small"
        items={[
          { key: 'side-by-side', label: 'Side-by-side', children: renderSideBySide() },
          { key: 'unified', label: 'Unified', children: renderUnified() },
          { key: 'summary', label: 'Summary', children: renderSummary() },
        ]}
      />

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <Space>
          <Button type="primary" icon={<CheckOutlined />} onClick={onApprove} disabled={changedDiffs.length === 0}>
            Approve Change
          </Button>
          <Button danger icon={<CloseOutlined />} onClick={onReject}>
            Reject
          </Button>
        </Space>
        <div className="text-xs text-gray-500">{changedDiffs.length} field{changedDiffs.length !== 1 ? 's' : ''} will be updated</div>
      </div>

      {renderDrawerEditForm()}

      <Modal
        title={
          <div className="flex items-center justify-between">
            <span>{inlineField ? `Edit ${inlineField}` : 'Edit'}</span>
            <Space size="small">
              <span className="text-xs text-gray-500">Dark</span>
              <Switch size="small" checked={editTheme === 'light'} onChange={(checked) => setEditTheme(checked ? 'light' : 'dark')} />
              <span className="text-xs text-gray-500">Light</span>
            </Space>
          </div>
        }
        open={inlineField !== null}
        destroyOnClose
        afterOpenChange={(open) => {
          setIsEditorReady(open);
          if (!open) {
            mergeViewRef.current?.destroy();
            mergeViewRef.current = null;
          }
        }}
        onOk={handleInlineSave}
        onCancel={closeInlineEditor}
        okText="Save"
        cancelText="Cancel"
        width="80vw"
        style={{ top: 24 }}
        styles={{
          content: {
            padding: 0,
            background: editTheme === 'dark' ? '#0b1220' : '#f8fafc',
            border: editTheme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            borderRadius: 12,
            overflow: 'hidden',
          },
          header: {
            background: editTheme === 'dark' ? '#0b1220' : '#f8fafc',
            borderBottom: editTheme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            margin: 0,
            padding: '12px 16px',
          },
          body: {
            padding: 8,
            background: editTheme === 'dark' ? '#0b1220' : '#f8fafc',
          },
        }}
      >
        <div
          ref={mergeHostRef}
          style={{
            height: '70vh',
            borderRadius: 10,
            overflow: 'hidden',
            background: editTheme === 'dark' ? '#0f172a' : '#ffffff',
            border: editTheme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          }}
        />
      </Modal>
    </Card>
  );
};
