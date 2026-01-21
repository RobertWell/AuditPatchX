import { useEffect, useMemo, useState } from 'react';
import { ConfigProvider, Input, Layout, Modal, Spin, Switch, Typography, message, theme } from 'antd';
import { TableSelector } from './components/TableSelector';
import { DataGrid } from './components/DataGrid';
import { DiffView } from './components/DiffView';
import apiClient from './services/api';
import { getChangedFields } from './services/diffUtils';
import { TableMetadataResponse } from './types/api';
import { ThemeMode } from './types/theme';

const { Header, Content } = Layout;
const { Title } = Typography;

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('auditpatchx.theme');
    return saved === ThemeMode.Dark ? ThemeMode.Dark : ThemeMode.Light;
  });
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

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem('auditpatchx.theme', themeMode);
  }, [themeMode]);

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
        algorithm: themeMode === ThemeMode.Dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#3078c1',
        },
      }}
    >
      <Layout className={`min-h-screen ${themeMode === ThemeMode.Dark ? 'app-dark' : 'app-light'}`}>
        <Header className="app-header">
          <Title level={3} className="m-0 py-2" style={{ color: '#fff' }}>
            AuditPatchX - Database Configuration Manager
          </Title>
          <div className="flex items-center gap-2 text-white/90">
            <span className="text-xs">Dark</span>
            <Switch
              checked={themeMode === ThemeMode.Dark}
              onChange={(v) => setThemeMode(v ? ThemeMode.Dark : ThemeMode.Light)}
            />
          </div>
        </Header>

        <Content className="app-content">
          <Spin spinning={loading}>
            <div className="max-w-screen-2xl mx-auto">
              <TableSelector onQuery={handleQuery} />

              <div className="grid grid-cols-1 gap-4">
                {/* Data Grid */}
                {gridData.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Query Results</h3>
                    <DataGrid
                      data={gridData}
                      columns={gridColumns}
                      onRowClick={handleRowClick}
                      selectedRowKey={selectedRowKey}
                      themeMode={themeMode}
                    />
                  </div>
                )}

                {/* Diff View */}
                {showDiff && (
                  <div>
                    <DiffView
                      before={beforeData}
                      after={afterData}
                      onAfterChange={handleAfterChange}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      pkColumns={pkColumns}
                      metadata={metadata}
                      themeMode={themeMode}
                    />
                  </div>
                )}
              </div>
            </div>
          </Spin>

          <Modal
            title="Approve Changes"
            open={approveOpen}
            okText="Approve"
            cancelText="Cancel"
            okButtonProps={{ disabled: approveSubmitting || approveReason.trim().length === 0 }}
            confirmLoading={approveSubmitting}
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
              } catch (error: any) {
                message.error(`Update failed: ${error.response?.data?.error || error.message}`);
                setApproveError(error.response?.data?.error || error.message || 'Update failed');
              } finally {
                setApproveSubmitting(false);
                setLoading(false);
              }
            }}
          >
            <p className="mb-2">You are about to update the following fields:</p>
            <ul className="list-disc list-inside mb-3">
              {Object.keys(pendingChangedFields || {}).map((field) => (
                <li key={field} className="text-sm">
                  <strong>{field}</strong>: {String(beforeData[field])} →{' '}
                  {String((pendingChangedFields as any)[field])}
                </li>
              ))}
            </ul>
            <Input.TextArea
              value={approveReason}
              onChange={(e) => {
                setApproveReason(e.target.value);
                if (approveError) setApproveError(null);
              }}
              placeholder="Enter reason for this change (required)"
              rows={3}
            />
            {approveError && <div className="text-red-600 text-xs mt-2">{approveError}</div>}
          </Modal>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
