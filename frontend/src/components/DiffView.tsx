import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Card, Badge, Tabs, Form, Input, Button, Space, Drawer, Modal, Switch, Typography, Tooltip } from 'antd';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorView, type ViewUpdate, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { CheckOutlined, CloseOutlined, EditOutlined, InfoCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { computeDiff, formatValue, type FieldDiff } from '../services/diffUtils';
import { TableMetadataResponse } from '../types/api';

const { Text, Title } = Typography;

interface DiffViewProps {
  before: Record<string, any>;
  after: Record<string, any>;
  onAfterChange: (after: Record<string, any>) => void;
  onApprove: () => void;
  onReject: () => void;
  pkColumns: string[];
  metadata: TableMetadataResponse | null;
}

// --- Radiant Glass Theme for CodeMirror ---
const radiantGlassTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      height: '100%',
    },
    '.cm-gutters': {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      color: 'rgba(255, 255, 255, 0.4)',
      borderRight: '1px solid rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(4px)',
    },
    '.cm-content': {
      caretColor: '#fff',
      paddingBottom: '200px', // Extra space for comfortable scrolling
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    // Merge view specific styles
    '.cm-merge-a .cm-changedLine': {
      backgroundColor: 'rgba(244, 67, 54, 0.15)', // Red tint for deletions
    },
    '.cm-merge-b .cm-changedLine': {
      backgroundColor: 'rgba(76, 175, 80, 0.15)', // Green tint for additions
    },
    '.cm-merge-a .cm-changedText': {
      backgroundColor: 'rgba(244, 67, 54, 0.4)', // Stronger red for text changes
      color: '#ffcdd2',
    },
    '.cm-merge-b .cm-changedText': {
      backgroundColor: 'rgba(76, 175, 80, 0.4)', // Stronger green for text changes
      color: '#c8e6c9',
    },
    '.cm-mergeSpacer': {
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
      pointerEvents: 'none',
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
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>(after);
  const [inlineField, setInlineField] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState<string>('');
  const [isEditorReady, setIsEditorReady] = useState(false);
  const modifiedValueRef = useRef<string>('');
  const mergeHostRef = useRef<HTMLDivElement | null>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const diffs = computeDiff(before, after, metadata || undefined);
  const changedDiffs = diffs.filter((d) => d.changed);
  const unchangedDiffs = diffs.filter((d) => !d.changed);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);

  // --- Utility Rendering Functions ---
  const renderLineDiff = (diff: FieldDiff, side: 'before' | 'after') => {
    // ... existing logic for line diffs (kept concise for clarity) ...
    const lineNodes: ReactNode[] = [];
    diff.textDiff?.forEach((part, partIndex) => {
      if (part.added && side === 'before') return;
      if (part.removed && side === 'after') return;
      const className = part.added
        ? 'bg-green-500/20 text-green-100' // Tailwind classes for glass look
        : part.removed
          ? 'bg-red-500/20 text-red-100'
          : 'text-gray-300';
      const lines = part.value.split('\n');
      lines.forEach((line, lineIndex) => {
        const isLast = lineIndex === lines.length - 1;
        lineNodes.push(
          <div key={`${diff.field}-${side}-${partIndex}-${lineIndex}`} className={`${className} px-1 font-mono text-sm`}>
            {line === '' ? ' ' : line}
          </div>
        );
        if (!isLast) lineNodes.push(<br key={`${diff.field}-${side}-${partIndex}-${lineIndex}-br`} />);
      });
    });
    return <div className="leading-snug">{lineNodes}</div>;
  };

  const renderValue = (diff: FieldDiff, side: 'before' | 'after') => {
    const value = side === 'before' ? diff.before : diff.after;
    if (!diff.textDiff || typeof value !== 'string') {
      return <span className="whitespace-pre-wrap break-words text-gray-200">{formatValue(value)}</span>;
    }
    if (diff.textDiffMode === 'lines') return renderLineDiff(diff, side);

    const lineClass = side === 'before' ? 'bg-red-900/10' : 'bg-green-900/10';
    return (
      <span className={`whitespace-pre-wrap break-words font-mono text-sm ${lineClass} block p-1 rounded`}>
        {diff.textDiff.map((part, index) => {
          if (part.added && side === 'before') return null;
          if (part.removed && side === 'after') return null;
          const className = part.added
            ? 'bg-green-600/40 text-green-50 rounded px-1'
            : part.removed
              ? 'bg-red-600/40 text-red-50 rounded px-1 line-through opacity-70'
              : 'text-gray-300';
          return (
            <span key={`${diff.field}-${side}-${index}`} className={className}>
              {part.value}
            </span>
          );
        })}
      </span>
    );
  };

  // --- Actions ---
  const handleFieldEdit = (field: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  };

  const canEditField = (field: string) => !pkColumns.includes(field);

  const openInlineEditor = (field: string) => {
    if (!canEditField(field)) return;
    setInlineField(field);
    const current = after[field];
    const currentValue = current == null ? '' : String(current);
    setInlineValue(currentValue);
    modifiedValueRef.current = currentValue;
  };

  const handleInlineSave = () => {
    if (!inlineField) return;
    const latestValue = modifiedValueRef.current;
    setInlineValue(latestValue);
    const updated = { ...after, [inlineField]: latestValue };
    setEditValues(updated);
    onAfterChange(updated);
    setInlineField(null);
    setInlineValue('');
    modifiedValueRef.current = '';
  };

  const handleInlineCancel = () => {
    setInlineField(null);
    setInlineValue('');
    modifiedValueRef.current = '';
  };

  const inlineOriginal = inlineField ? String(before[inlineField] ?? '') : '';
  const normalizeEditorValue = (value: string) => value.replace(/\r\n/g, '\n');

  // --- CodeMirror Setup ---
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

    // Always use our Glass Dark Theme for that epic look
    const themeExtensions = [oneDark, radiantGlassTheme];
    const readOnly = EditorState.readOnly.of(true);
    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        modifiedValueRef.current = update.state.doc.toString();
      }
    });

    const initialValue = normalizeEditorValue(modifiedValueRef.current || inlineValue);

    const view = new MergeView({
      parent: mergeHostRef.current,
      a: {
        doc: normalizeEditorValue(inlineOriginal),
        extensions: [...baseExtensions, ...themeExtensions, readOnly],
      },
      b: {
        doc: initialValue,
        extensions: [...baseExtensions, ...themeExtensions, updateListener],
      },
      gutter: true,
      highlightChanges: true,
    });

    mergeViewRef.current = view;

    return () => {
      mergeViewRef.current?.destroy();
      mergeViewRef.current = null;
    };
  }, [isEditorReady, inlineField, inlineOriginal, inlineValue]);

  const handleSaveEdit = () => {
    onAfterChange(editValues);
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditValues(after);
    setEditMode(false);
  };

  const handleSyncScroll = (source: 'left' | 'right') => {
    if (syncingRef.current) return;
    const sourceEl = source === 'left' ? leftPaneRef.current : rightPaneRef.current;
    const targetEl = source === 'left' ? rightPaneRef.current : leftPaneRef.current;
    if (!sourceEl || !targetEl) return;
    syncingRef.current = true;
    targetEl.scrollTop = sourceEl.scrollTop;
    syncingRef.current = false;
  };

  const renderClickableValue = (diff: FieldDiff, side: 'before' | 'after') => (
    <div
      onDoubleClick={() => openInlineEditor(diff.field)}
      className={`
        p-2 rounded transition-all duration-200 border border-transparent
        ${canEditField(diff.field)
          ? 'cursor-pointer hover:bg-white/5 hover:border-white/10 hover:shadow-lg'
          : 'cursor-not-allowed opacity-60'}
      `}
    >
      {renderValue(diff, side)}
    </div>
  );

  // --- Views ---
  const renderSideBySide = () => (
    <div className="flex gap-4 h-[500px] overflow-hidden">
      {/* Left Pane (Before) */}
      <div className="flex-1 flex flex-col rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-white/5 shadow-inner">
        <div className="bg-gradient-to-r from-red-900/30 to-transparent px-4 py-2 text-xs font-bold text-red-200 uppercase tracking-wider sticky top-0 z-10 flex justify-between items-center">
          <span>Current Data</span>
          <InfoCircleOutlined />
        </div>
        <div
          ref={leftPaneRef}
          onScroll={() => handleSyncScroll('left')}
          className="flex-1 overflow-auto p-3 custom-scrollbar"
        >
          {diffs.map((diff) => (
            <div key={diff.field} className={`mb-3 ${diff.changed ? 'bg-red-500/5 rounded-lg' : ''}`}>
              <div className="text-xs text-blue-300/80 mb-1 font-medium">{diff.field}</div>
              {renderClickableValue(diff, 'before')}
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane (After) */}
      <div className="flex-1 flex flex-col rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-white/5 shadow-inner relative">
        <div className="bg-gradient-to-r from-green-900/30 to-transparent px-4 py-2 text-xs font-bold text-green-200 uppercase tracking-wider sticky top-0 z-10 flex justify-between items-center">
          <span>Proposed Changes</span>
          {changedDiffs.length > 0 && <Badge count={changedDiffs.length} color="#52c41a" />}
        </div>
        <div
          ref={rightPaneRef}
          onScroll={() => handleSyncScroll('right')}
          className="flex-1 overflow-auto p-3 custom-scrollbar"
        >
          {diffs.map((diff) => (
            <div key={diff.field} className={`mb-3 ${diff.changed ? 'bg-green-500/5 rounded-lg transition-colors duration-500' : ''}`}>
              <div className="text-xs text-blue-300/80 mb-1 font-medium">{diff.field}</div>
              {renderClickableValue(diff, 'after')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // --- Main Render ---
  return (
    <Card
      bordered={false}
      bodyStyle={{ padding: 0 }}
      className="h-full bg-transparent shadow-none"
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <Title level={4} style={{ margin: 0, color: '#e2e8f0' }}>Review Changes</Title>
          <Text type="secondary" className="text-gray-400 text-xs">Double-click any highlighted field to edit deeply.</Text>
        </div>
        <Space>
          <Button type="text" icon={<SettingOutlined className="text-gray-400" />} />
          <Button
            icon={<EditOutlined />}
            onClick={() => setEditMode(true)}
            className="bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:text-white"
          >
            Bulk Edit
          </Button>
        </Space>
      </div>

      {/* Main Diff Area */}
      {renderSideBySide()}

      {/* Footer Actions */}
      <div className="mt-6 flex items-center justify-between pt-4 border-t border-white/10">
        <div className="text-xs text-gray-500">
          {changedDiffs.length > 0 ? (
            <span className="text-green-400 font-semibold">{changedDiffs.length} modifications pending</span>
          ) : (
            <span>No changes detected yet</span>
          )}
        </div>
        <Space size="middle">
          <Button
            danger
            ghost
            icon={<CloseOutlined />}
            onClick={onReject}
            className="hover:bg-red-500/10"
          >
            Reject All
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={onApprove}
            disabled={changedDiffs.length === 0}
            className="bg-blue-600 hover:bg-blue-500 border-none shadow-lg shadow-blue-900/50"
          >
            Approve & Merge
          </Button>
        </Space>
      </div>

      {/* --- Epic Glass Modal for Inline Editing --- */}
      <Modal
        open={inlineField !== null}
        destroyOnClose
        afterOpenChange={(open) => {
          setIsEditorReady(open);
          if (!open) {
            mergeViewRef.current?.destroy();
            mergeViewRef.current = null;
          }
        }}
        footer={null}
        closable={false}
        width="90vw"
        style={{ top: 20 }}
        wrapClassName="glass-modal-wrapper"
        maskStyle={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
        modalRender={(modal) => (
          <div className="bg-[#0f172a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-0 flex flex-col animate-in fade-in zoom-in-95 duration-300">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <EditOutlined />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white m-0 tracking-tight">Editing <span className="text-blue-400 font-mono">{inlineField}</span></h3>
                  <p className="text-xs text-gray-400 m-0">Merging changes with intelligent conflict detection</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip title="Cancel (Esc)">
                  <Button
                    type="text"
                    icon={<CloseOutlined className="text-gray-400" />}
                    onClick={handleInlineCancel}
                    className="hover:bg-white/10 hover:text-white rounded-full w-8 h-8 flex items-center justify-center"
                  />
                </Tooltip>
              </div>
            </div>

            {/* Editor Container */}
            <div className="p-1 bg-black/20 flex-1 relative h-[70vh]">
              <div ref={mergeHostRef} className="h-full w-full custom-scrollbar" />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-between items-center">
              <div className="text-xs text-gray-500 font-mono">
                <span className="inline-block w-3 h-3 bg-red-500/50 rounded-sm mr-2 align-middle"></span>Original
                <span className="mx-2 text-gray-700">|</span>
                <span className="inline-block w-3 h-3 bg-green-500/50 rounded-sm mr-2 align-middle"></span>Proposed
              </div>
              <Space>
                <Button onClick={handleInlineCancel} className="bg-transparent border-white/20 text-gray-300 hover:text-white hover:border-white/40">
                  Discard Changes
                </Button>
                <Button
                  type="primary"
                  onClick={handleInlineSave}
                  className="bg-blue-600 hover:bg-blue-500 text-white border-none shadow-lg shadow-blue-500/30 px-6 font-semibold"
                >
                  Confirm Merge
                </Button>
              </Space>
            </div>
          </div>
        )}
      >
        {/* Intentionally empty - content is handled by modalRender to fully control structure */}
      </Modal>

      {/* Global Style overrides for this component to ensure the 'Epic' feel works without polluting everything */}
      <style>{`
        .glass-modal-wrapper .ant-modal-content {
           background: transparent !important;
           box-shadow: none !important;
        }
        .custom-scrollbar::-webkit-scrollbar {
           width: 8px;
           height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
           background: rgba(0,0,0,0.2);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
           background: rgba(255,255,255,0.1);
           border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
           background: rgba(255,255,255,0.2);
        }
      `}</style>
    </Card>
  );
};
