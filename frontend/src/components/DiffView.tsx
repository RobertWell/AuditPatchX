import React from 'react';
import { Card, Badge, Tabs, Form, Input, Button, Space, Drawer, Modal, Switch } from 'antd';
import { DiffEditor } from '@monaco-editor/react';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import { computeDiff, formatValue, type FieldDiff } from '../services/diffUtils';
import { TableMetadataResponse } from '../types/api';

interface DiffViewProps {
  before: Record<string, any>;
  after: Record<string, any>;
  onAfterChange: (after: Record<string, any>) => void;
  onApprove: () => void;
  onReject: () => void;
  pkColumns: string[];
  metadata: TableMetadataResponse | null;
}

export const DiffView: React.FC<DiffViewProps> = ({
  before,
  after,
  onAfterChange,
  onApprove,
  onReject,
  pkColumns,
  metadata,
}) => {
  const [viewMode, setViewMode] = React.useState<'side-by-side' | 'unified' | 'summary'>('side-by-side');
  const [editMode, setEditMode] = React.useState(false);
  const [editValues, setEditValues] = React.useState<Record<string, any>>(after);
  const [inlineField, setInlineField] = React.useState<string | null>(null);
  const [inlineValue, setInlineValue] = React.useState<string>('');
  const [editTheme, setEditTheme] = React.useState<'dark' | 'light'>('dark');
  const diffs = computeDiff(before, after, metadata || undefined);
  const changedDiffs = diffs.filter((d) => d.changed);
  const unchangedDiffs = diffs.filter((d) => !d.changed);
  const leftPaneRef = React.useRef<HTMLDivElement | null>(null);
  const rightPaneRef = React.useRef<HTMLDivElement | null>(null);
  const syncingRef = React.useRef(false);

  const renderLineDiff = (diff: FieldDiff, side: 'before' | 'after') => {
    const lineNodes: React.ReactNode[] = [];
    diff.textDiff?.forEach((part, partIndex) => {
      if (part.added && side === 'before') return;
      if (part.removed && side === 'after') return;
      const className = part.added
        ? 'diff-line-added'
        : part.removed
        ? 'diff-line-removed'
        : 'diff-line-neutral';
      const lines = part.value.split('\n');
      lines.forEach((line, lineIndex) => {
        const isLast = lineIndex === lines.length - 1;
        lineNodes.push(
          <div key={`${diff.field}-${side}-${partIndex}-${lineIndex}`} className={className}>
            {line === '' ? ' ' : line}
          </div>
        );
        if (!isLast) {
          lineNodes.push(
            <div
              key={`${diff.field}-${side}-${partIndex}-${lineIndex}-spacer`}
              className={className}
            >
              {' '}
            </div>
          );
        }
      });
    });

    return <div className="diff-lines">{lineNodes}</div>;
  };

  const renderValue = (diff: FieldDiff, side: 'before' | 'after') => {
    const value = side === 'before' ? diff.before : diff.after;
    if (!diff.textDiff || typeof value !== 'string') {
      return <span className="whitespace-pre-wrap break-words">{formatValue(value)}</span>;
    }

    if (diff.textDiffMode === 'lines') {
      return renderLineDiff(diff, side);
    }

    const lineClass = side === 'before' ? 'diff-line-removed-soft' : 'diff-line-added';

    return (
      <span className={`whitespace-pre-wrap break-words diff-inline-line ${lineClass}`}>
        {diff.textDiff.map((part, index) => {
          if (part.added && side === 'before') return null;
          if (part.removed && side === 'after') return null;
          const className = part.added
            ? 'diff-word-added-strong'
            : part.removed
            ? 'diff-word-removed-strong'
            : '';
          return (
            <span key={`${diff.field}-${side}-${index}`} className={className}>
              {part.value}
            </span>
          );
        })}
      </span>
    );
  };

  const handleFieldEdit = (field: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  };

  const canEditField = (field: string) => !pkColumns.includes(field);

  const openInlineEditor = (field: string) => {
    if (!canEditField(field)) return;
    setInlineField(field);
    const current = after[field];
    setInlineValue(current == null ? '' : String(current));
  };

  const handleInlineSave = () => {
    if (!inlineField) return;
    const updated = { ...after, [inlineField]: inlineValue };
    setEditValues(updated);
    onAfterChange(updated);
    setInlineField(null);
  };

  const handleInlineCancel = () => {
    setInlineField(null);
    setInlineValue('');
  };

  const inlineOriginal = inlineField ? String(before[inlineField] ?? '') : '';

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
      className={canEditField(diff.field) ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}
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
        <div
          ref={leftPaneRef}
          onScroll={() => handleSyncScroll('left')}
          className="flex-1 overflow-auto p-2 diff-view font-mono"
        >
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className={`mb-1 p-1 rounded ${diff.changed ? 'diff-row-removed' : ''}`}
            >
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
          <span className="text-green-400">
            {changedDiffs.length} change{changedDiffs.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div
          ref={rightPaneRef}
          onScroll={() => handleSyncScroll('right')}
          className="flex-1 overflow-auto p-2 diff-view font-mono"
        >
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className={`mb-1 p-1 rounded ${diff.changed ? 'diff-row-added' : ''}`}
            >
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
                {renderClickableValue(diff, 'before')}
              </div>
              <div className="diff-row-added p-1 rounded">
                <span className="diff-line-number">+</span>
                {renderClickableValue(diff, 'after')}
              </div>
            </>
          ) : (
            <div className="p-1">{renderClickableValue(diff, 'before')}</div>
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
                    <span className="font-semibold">Before:</span> {renderClickableValue(diff, 'before')}
                  </div>
                  <div className="text-green-600">
                    <span className="font-semibold">After:</span> {renderClickableValue(diff, 'after')}
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
        <div className="text-xs text-gray-500">
          {unchangedDiffs.map((diff) => diff.field).join(', ')}
        </div>
      </div>
    </div>
  );

  const renderEditForm = () => (
    <Drawer
      title="Edit Proposed Values"
      open={editMode}
      onClose={handleCancelEdit}
      width={400}
      extra={
        <Space>
          <Button onClick={handleCancelEdit}>Cancel</Button>
          <Button onClick={handleSaveEdit} type="primary">
            Save
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {Object.keys(after)
          .filter((key) => !pkColumns.includes(key))
          .map((key) => (
            <Form.Item key={key} label={key}>
              <Input.TextArea
                value={editValues[key] ?? ''}
                onChange={(e) => handleFieldEdit(key, e.target.value)}
                rows={2}
              />
            </Form.Item>
          ))}
      </Form>
    </Drawer>
  );

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Diff View</span>
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditMode(true)}
            >
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
          {
            key: 'side-by-side',
            label: 'Side-by-side',
            children: renderSideBySide(),
          },
          {
            key: 'unified',
            label: 'Unified',
            children: renderUnified(),
          },
          {
            key: 'summary',
            label: 'Summary',
            children: renderSummary(),
          },
        ]}
      />

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <Space>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={onApprove}
            disabled={changedDiffs.length === 0}
          >
            Approve Change
          </Button>
          <Button danger icon={<CloseOutlined />} onClick={onReject}>
            Reject
          </Button>
        </Space>

        <div className="text-xs text-gray-500">
          {changedDiffs.length} field{changedDiffs.length !== 1 ? 's' : ''} will be updated
        </div>
      </div>

      {renderEditForm()}

      <Modal
        open={inlineField !== null}
        title={
          <div className="flex items-center justify-between">
            <span>{inlineField ? `Edit ${inlineField}` : 'Edit'}</span>
            <Space size="small">
              <span className="text-xs text-gray-500">Dark</span>
              <Switch
                size="small"
                checked={editTheme === 'light'}
                onChange={(checked) => setEditTheme(checked ? 'light' : 'dark')}
              />
              <span className="text-xs text-gray-500">Light</span>
            </Space>
          </div>
        }
        onOk={handleInlineSave}
        onCancel={handleInlineCancel}
        okText="Save"
        cancelText="Cancel"
        width="80vw"
        style={{ top: 24 }}
        bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
      >
        <div className={`diff-edit-root ${editTheme === 'dark' ? 'diff-edit-dark' : 'diff-edit-light'}`}>
          <style>{`
            .diff-edit-dark .ant-input,
            .diff-edit-dark .ant-input-affix-wrapper,
            .diff-edit-dark .ant-input-textarea {
              background-color: transparent;
              color: #e2e8f0;
              border-color: #334155;
            }
            .diff-edit-dark .ant-input::placeholder {
              color: #94a3b8;
            }
            .diff-edit-dark .ant-modal-body {
              background-color: #0b1220;
            }
          `}</style>
          <div className="diff-edit-panel border border-gray-300 rounded">
            <DiffEditor
              original={inlineOriginal}
              modified={inlineValue}
              language="plaintext"
              theme={editTheme === 'dark' ? 'vs-dark' : 'light'}
              onChange={(value) => setInlineValue(value ?? '')}
              options={{
                renderSideBySide: true,
                readOnly: false,
                originalEditable: false,
                minimap: { enabled: false },
                renderIndicators: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
              }}
              height="60vh"
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
};
