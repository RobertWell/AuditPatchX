import React from 'react';
import { Card, Badge, Tabs, Form, Input, Button, Space, Modal } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import { computeDiff, formatValue, type FieldDiff } from '../services/diffUtils';

interface DiffViewProps {
  before: Record<string, any>;
  after: Record<string, any>;
  onAfterChange: (after: Record<string, any>) => void;
  onApprove: () => void;
  onReject: () => void;
  pkColumns: string[];
}

export const DiffView: React.FC<DiffViewProps> = ({
  before,
  after,
  onAfterChange,
  onApprove,
  onReject,
  pkColumns,
}) => {
  const [viewMode, setViewMode] = React.useState<'side-by-side' | 'unified' | 'summary'>('side-by-side');
  const [editMode, setEditMode] = React.useState(false);
  const [editValues, setEditValues] = React.useState<Record<string, any>>(after);

  const diffs = computeDiff(before, after);
  const changedDiffs = diffs.filter((d) => d.changed);
  const unchangedDiffs = diffs.filter((d) => !d.changed);

  const handleFieldEdit = (field: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = () => {
    onAfterChange(editValues);
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditValues(after);
    setEditMode(false);
  };

  const renderSideBySide = () => (
    <div className="flex gap-2 h-96 overflow-hidden">
      <div className="flex-1 border border-gray-300 rounded bg-gray-50 flex flex-col">
        <div className="bg-gray-700 text-white px-3 py-1 text-xs font-semibold">
          Before (Current Data)
        </div>
        <div className="flex-1 overflow-auto p-2 diff-view font-mono">
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className={`mb-1 p-1 rounded ${diff.changed ? 'diff-removed' : ''}`}
            >
              <span className="text-blue-600 font-semibold">{diff.field}:</span>{' '}
              {formatValue(diff.before)}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 border border-gray-300 rounded bg-gray-50 flex flex-col">
        <div className="bg-gray-700 text-white px-3 py-1 text-xs font-semibold flex justify-between">
          <span>After (Proposed Changes)</span>
          <span className="text-green-400">
            {changedDiffs.length} change{changedDiffs.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex-1 overflow-auto p-2 diff-view font-mono">
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className={`mb-1 p-1 rounded ${diff.changed ? 'diff-added' : ''}`}
            >
              <span className="text-blue-600 font-semibold">{diff.field}:</span>{' '}
              {formatValue(diff.after)}
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
              <div className="diff-removed p-1 rounded mb-1">
                <span className="diff-line-number">-</span>
                {formatValue(diff.before)}
              </div>
              <div className="diff-added p-1 rounded">
                <span className="diff-line-number">+</span>
                {formatValue(diff.after)}
              </div>
            </>
          ) : (
            <div className="p-1">{formatValue(diff.before)}</div>
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
                    <span className="font-semibold">Before:</span> {formatValue(diff.before)}
                  </div>
                  <div className="text-green-600">
                    <span className="font-semibold">After:</span> {formatValue(diff.after)}
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
    <Modal
      title="Edit Proposed Values"
      open={editMode}
      onOk={handleSaveEdit}
      onCancel={handleCancelEdit}
      width={600}
    >
      <Form layout="vertical" className="max-h-96 overflow-auto">
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
    </Modal>
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
    </Card>
  );
};
