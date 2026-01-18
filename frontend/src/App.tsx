import { useMemo, useState } from 'react';
import { Layout, Typography, message, Modal, Input, Spin, ConfigProvider, theme } from 'antd';
import { TableSelector } from './components/TableSelector';
import { DataGrid } from './components/DataGrid';
import { DiffView } from './components/DiffView';
import apiClient from './services/api';
import { getChangedFields } from './services/diffUtils';
import { TableMetadataResponse } from './types/api';

const { Content } = Layout;
const { Paragraph } = Typography;

function App() {
  const [loading, setLoading] = useState(false);
  const [currentSchema, setCurrentSchema] = useState<string>('');
  const [currentTable, setCurrentTable] = useState<string>('');
  const [currentPk, setCurrentPk] = useState<Record<string, any>>({});
  const [pkColumns, setPkColumns] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<TableMetadataResponse | null>(null);

  // Grid state
  const [gridData, setGridData] = useState<Record<string, any>[]>([]);
  const [gridColumns, setGridColumns] = useState<string[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState<string>('');

  // Diff state
  const [beforeData, setBeforeData] = useState<Record<string, any>>({});
  const [afterData, setAfterData] = useState<Record<string, any>>({});
  const [showDiff, setShowDiff] = useState(false);

  const [approveOpen, setApproveOpen] = useState(false);
  const [approveReason, setApproveReason] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [pendingChangedFields, setPendingChangedFields] = useState<Record<string, any> | null>(null);

  const changedFields = useMemo(() => getChangedFields(beforeData, afterData), [beforeData, afterData]);

  const handleQuery = async (schema: string, table: string, pkValues: Record<string, string>) => {
    setLoading(true);
    try {
      // Store current context
      setCurrentSchema(schema);
      setCurrentTable(table);
      setCurrentPk(pkValues);

      // Get table metadata to know PK columns and diff policy
      const metadataResp = await apiClient.getTableMetadata(schema, table);
      setPkColumns(metadataResp.pkColumns);
      setMetadata(metadataResp);

      // Query by PK
      const response = await apiClient.getByPk({
        schema,
        table,
        pk: pkValues,
      });

      // Display in grid
      setGridData([response.row]);
      setGridColumns(Object.keys(response.row));

      // Load into diff view as baseline
      setBeforeData(response.row);
      setAfterData(response.row);
      setShowDiff(true);

      message.success('Record loaded successfully');
    } catch (error: any) {
      message.error(`Failed to load record: ${error.response?.data?.error || error.message}`);
      console.error('Query error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = async (row: Record<string, any>) => {
    setSelectedRowKey(JSON.stringify(row));

    // Extract PK values from row
    const pkValues: Record<string, any> = {};
    pkColumns.forEach((col) => {
      pkValues[col] = row[col];
    });

    setLoading(true);
    try {
      // Fetch fresh baseline
      const response = await apiClient.getByPk({
        schema: currentSchema,
        table: currentTable,
        pk: pkValues,
      });

      setBeforeData(response.row);
      setAfterData(response.row);
      setCurrentPk(pkValues);
      setShowDiff(true);
    } catch (error: any) {
      message.error(`Failed to load record: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAfterChange = (newAfter: Record<string, any>) => {
    setAfterData(newAfter);
  };

  const handleApprove = async () => {
    if (Object.keys(changedFields).length === 0) {
      message.warning('No changes to apply');
      return;
    }

    setPendingChangedFields(changedFields);
    setApproveReason('');
    setApproveError(null);
    setApproveOpen(true);
  };

  const handleReject = () => {
    // Reset after to match before
    setAfterData(beforeData);
    message.info('Changes rejected');
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3b82f6',
          colorBgBase: '#0f172a',
          colorTextBase: '#e2e8f0',
          fontFamily: "'Inter', sans-serif",
        },
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'transparent',
          },
          Card: {
            colorBgContainer: 'transparent',
          },
        },
      }}
    >
      <Layout className="min-h-screen bg-transparent">
        <Content className="p-6 md:p-10 flex flex-col items-center">

          {/* Hero Section */}
          <div className="w-full max-w-5xl text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
            <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
              <span className="text-gradient">AuditPatchX</span>
            </h1>
            <Paragraph className="text-lg text-slate-400 max-w-2xl mx-auto">
              Advanced Database Configuration Manager with intelligent diff tracking and semantic versioning control.
            </Paragraph>
          </div>

          <Spin spinning={loading}>
            <div className="w-full max-w-7xl mx-auto space-y-8">

              {/* Main Selector Card */}
              <div className="glass-panel rounded-2xl p-6 md:p-8 animate-in delay-100 fade-in zoom-in-95 duration-500">
                <TableSelector onQuery={handleQuery} />
              </div>

              {/* Data Grid & Diff View Area */}
              {(gridData.length > 0 || showDiff) && (
                <div className="grid grid-cols-1 lg:grid-cols-1 gap-8 animate-in delay-200 fade-in slide-in-from-bottom-4 duration-500">

                  {/* Data Grid - Only show if we have data and NO diff yet, or maybe above diff? Let's hide if diff is active to focus? No, keep it. */}
                  {gridData.length > 0 && (
                    <div className="glass-panel rounded-2xl p-6 overflow-hidden">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Current Record</h3>
                      </div>
                      <DataGrid
                        data={gridData}
                        columns={gridColumns}
                        onRowClick={handleRowClick}
                        selectedRowKey={selectedRowKey}
                      />
                    </div>
                  )}

                  {/* Diff View - The Star of the Show */}
                  {showDiff && (
                    <div className="glass-panel rounded-2xl p-1 shadow-2xl shadow-blue-900/20 ring-1 ring-white/10">
                      <DiffView
                        before={beforeData}
                        after={afterData}
                        onAfterChange={handleAfterChange}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        pkColumns={pkColumns}
                        metadata={metadata}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </Spin>

          <Modal
            title="Approve Changes"
            open={approveOpen}
            okText="Confirm Update"
            cancelText="Cancel"
            okButtonProps={{ disabled: approveSubmitting || approveReason.trim().length === 0 }}
            confirmLoading={approveSubmitting}
            width={500}
            centered
            wrapClassName="glass-modal-wrapper"
            onCancel={() => {
              if (approveSubmitting) return;
              setApproveOpen(false);
              setApproveError(null);
            }}
            onOk={async () => {
              const reason = approveReason.trim();
              if (!reason) {
                setApproveError('Reason is required');
                return;
              }
              if (!pendingChangedFields || Object.keys(pendingChangedFields).length === 0) {
                setApproveError('No changes to apply');
                return;
              }

              setApproveSubmitting(true);
              setLoading(true);
              try {
                const response = await apiClient.update({
                  schema: currentSchema,
                  table: currentTable,
                  pk: currentPk,
                  set: pendingChangedFields,
                  reason,
                });

                message.success(`Successfully updated ${response.updated} record(s)`);

                setGridData([response.row]);
                setBeforeData(response.row);
                setAfterData(response.row);
                setApproveOpen(false);
                setApproveError(null);
                setShowDiff(false); // Close diff on success? Or keep open? Let's close for clean state

              } catch (error: any) {
                message.error(`Update failed: ${error.response?.data?.error || error.message}`);
                setApproveError(error.response?.data?.error || error.message || 'Update failed');
              } finally {
                setApproveSubmitting(false);
                setLoading(false);
              }
            }}
          >
            <div className="mt-4">
              <div className="bg-white/5 rounded-lg p-3 mb-4 border border-white/10">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-bold">FIELDS TO UPDATE</p>
                <div className="space-y-2">
                  {Object.keys(pendingChangedFields || {}).map((field) => (
                    <div key={field} className="flex items-center text-sm font-mono">
                      <span className="w-1/3 text-slate-300 truncate">{field}</span>
                      <span className="mx-2 text-slate-500">→</span>
                      <span className="text-green-400 truncate flex-1 block">
                        {String((pendingChangedFields as any)[field])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-slate-400 mb-2">Please provide a reason for this audit log:</p>
              <Input.TextArea
                value={approveReason}
                onChange={(e) => {
                  setApproveReason(e.target.value);
                  if (approveError) setApproveError(null);
                }}
                placeholder="Ticket number, change request ID, etc."
                rows={3}
                className="bg-black/20 border-white/10 text-slate-200 placeholder:text-slate-600 focus:bg-black/40"
              />
              {approveError && <div className="text-red-500 text-xs mt-2 bg-red-500/10 p-2 rounded">{approveError}</div>}
            </div>
          </Modal>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
