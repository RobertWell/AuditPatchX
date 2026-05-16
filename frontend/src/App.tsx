import { useEffect, useMemo, useState } from 'react';
import { ConfigProvider, Input, Layout, Modal, Spin, Switch, Typography, message, theme } from 'antd';
import { TableSelector } from './components/TableSelector';
import { DataGrid } from './components/DataGrid';
import { DiffView } from './components/DiffView';
import apiClient from './services/api';
import { getChangedFields } from './services/diffUtils';
import { TableMetadataResponse, CompareJobRequest, CompareJobDiffRow } from './types/api';
import { ThemeMode } from './types/theme';

// Figma UI Imports
import { Sidebar } from './components/Sidebar';
import { CompareJob } from './components/CompareJob';
import { DiffResult } from './components/DiffResult';
import { SqlReviewPanel } from './components/SqlReviewPanel';

const { Title } = Typography;

type Page = 'patches' | 'audit' | 'compare' | 'review' | 'history' | 'conflicts' | 'rules';

interface SqlReviewState {
  isOpen: boolean;
  rowId: string;
  column: string;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-background text-foreground h-full">
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">This feature is under development</p>
      </div>
    </div>
  );
}

function App() {
  // === Figma App State ===
  const [currentPage, setCurrentPage] = useState<Page>('patches');
  const [compareData, setCompareData] = useState<CompareJobDiffRow[]>([]);
  const [sqlReview, setSqlReview] = useState<SqlReviewState>({
    isOpen: false,
    rowId: '',
    column: ''
  });

  const handleOpenSqlReview = (row: any, column: string) => {
    setSqlReview({ isOpen: true, rowId: row.pk, column });
  };
  const handleCloseSqlReview = () => {
    setSqlReview({ isOpen: false, rowId: '', column: '' });
  };

  const handleRunComparison = async (config: CompareJobRequest) => {
    setLoading(true);
    try {
      const response = await apiClient.compareJob(config);
      setCompareData(response.differences);
      setCurrentPage('review');
    } catch (error: any) {
      message.error(`Compare failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // === Old AuditPatchX State ===
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

  const [gridData, setGridData] = useState<Record<string, any>[]>([]);
  const [gridColumns, setGridColumns] = useState<string[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState<string>('');

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
    if (themeMode === ThemeMode.Dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('auditpatchx.theme', themeMode);
  }, [themeMode]);

  const handleQuery = async (schema: string, table: string, pkValues: Record<string, string>) => {
    setLoading(true);
    try {
      setCurrentSchema(schema);
      setCurrentTable(table);
      setCurrentPk(pkValues);
      const metadataResp = await apiClient.getTableMetadata(schema, table);
      setPkColumns(metadataResp.pkColumns);
      setMetadata(metadataResp);
      const response = await apiClient.getByPk({ schema, table, pk: pkValues });
      setGridData([response.row]);
      setGridColumns(Object.keys(response.row));
      setBeforeData(response.row);
      setAfterData(response.row);
      setShowDiff(true);
      message.success('Record loaded successfully');
    } catch (error: any) {
      message.error(`Failed to load record: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = async (row: Record<string, any>) => {
    setSelectedRowKey(JSON.stringify(row));
    const pkValues: Record<string, any> = {};
    pkColumns.forEach((col) => { pkValues[col] = row[col]; });
    setLoading(true);
    try {
      const response = await apiClient.getByPk({ schema: currentSchema, table: currentTable, pk: pkValues });
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
    setAfterData(beforeData);
    message.info('Changes rejected');
  };

  const renderPatchesContent = () => (
    <ConfigProvider
      theme={{
        algorithm: themeMode === ThemeMode.Dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#3078c1' },
      }}
    >
      <div className={`flex-1 overflow-auto p-6 bg-background ${themeMode === ThemeMode.Dark ? 'app-dark dark' : 'app-light'}`}>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Patch Management</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Dark Mode</span>
            <Switch
              checked={themeMode === ThemeMode.Dark}
              onChange={(v) => setThemeMode(v ? ThemeMode.Dark : ThemeMode.Light)}
            />
          </div>
        </div>
        <div className="h-full">
          <Spin spinning={loading}>
            <div className="max-w-screen-2xl mx-auto">
              <TableSelector onQuery={handleQuery} />
              <div className="grid grid-cols-1 gap-4">
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
              if (!reason) { setApproveError('Reason is required'); return; }
              if (!pendingChangedFields || Object.keys(pendingChangedFields).length === 0) {
                setApproveError('No changes to apply'); return;
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
                  <strong>{field}</strong>: {String(beforeData[field])} → {String((pendingChangedFields as any)[field])}
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
        </div>
      </div>
    </ConfigProvider>
  );

  const renderContent = () => {
    switch (currentPage) {
      case 'patches':
        return renderPatchesContent();
      case 'audit':
        return <PlaceholderPage title="Audit Review" />;
      case 'compare':
        return <CompareJob onStartReview={handleRunComparison} />;
      case 'review':
        return <DiffResult data={compareData} onOpenSqlReview={handleOpenSqlReview} />;
      case 'conflicts':
        return <PlaceholderPage title="Conflict Review" />;
      case 'rules':
        return <PlaceholderPage title="Ignore Rules" />;
      default:
        return <PlaceholderPage title="Unknown Page" />;
    }
  };

  return (
    <div className="h-screen flex bg-background text-foreground w-full">
      <Sidebar currentPage={currentPage} onNavigate={(page) => setCurrentPage(page as Page)} />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {renderContent()}
      </div>
      {sqlReview.isOpen && (
        <SqlReviewPanel
          onClose={handleCloseSqlReview}
          rowId={sqlReview.rowId}
          column={sqlReview.column}
        />
      )}
    </div>
  );
}

export default App;
