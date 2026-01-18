import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Grid, Layout, Typography, message, Modal, Input, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { TableSelector } from './components/TableSelector';
import { DataGrid } from './components/DataGrid';
import { DiffView } from './components/DiffView';
import { SchemaTableNav } from './components/SchemaTableNav';
import apiClient from './services/api';
import { getChangedFields } from './services/diffUtils';
import type { TableInfo, TableMetadataResponse } from './types/api';

const { Header, Content } = Layout;
const { Title } = Typography;

function App() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [loading, setLoading] = useState(false);
  const [currentSchema, setCurrentSchema] = useState<string>('');
  const [currentTable, setCurrentTable] = useState<string>('');
  const [currentPk, setCurrentPk] = useState<Record<string, any>>({});
  const [pkColumns, setPkColumns] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<TableMetadataResponse | null>(null);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);

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
    const load = async () => {
      try {
        const list = await apiClient.listTables();
        setTables(list);
      } catch (error: any) {
        message.error(`Failed to load tables: ${error.response?.data?.error || error.message}`);
      }
    };
    load();
  }, []);

  const handleSelectTable = (schema: string, table: string) => {
    const selected = tables.find((t) => t.schema === schema && t.table === table) || null;
    setSelectedTable(selected);
    setCurrentSchema(schema);
    setCurrentTable(table);
    setGridData([]);
    setGridColumns([]);
    setSelectedRowKey('');
    setShowDiff(false);
    setBeforeData({});
    setAfterData({});
    setPkColumns(selected?.pkColumns ?? []);
    setMetadata(null);
    if (isMobile) setNavOpen(false);
  };

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
    <Layout className="min-h-screen">
      <Header className="bg-primary shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMobile && (
              <Button
                type="text"
                onClick={() => setNavOpen(true)}
                style={{ color: 'white' }}
                icon={<MenuOutlined />}
              />
            )}
            <Title level={3} className="text-white m-0 py-2">
              AuditPatchX - Database Configuration Manager
            </Title>
          </div>
          <div className="text-white/80 text-xs font-mono">
            {currentSchema && currentTable ? `${currentSchema}.${currentTable}` : ''}
          </div>
        </div>
      </Header>

      <Layout style={{ background: '#f6f8fa' }}>
        {!isMobile && (
          <SchemaTableNav
            tables={tables}
            selectedKey={selectedTable ? `${selectedTable.schema}.${selectedTable.table}` : null}
            onSelect={handleSelectTable}
            collapsed={navCollapsed}
            onCollapsedChange={setNavCollapsed}
          />
        )}

        <Drawer
          open={navOpen}
          onClose={() => setNavOpen(false)}
          placement="left"
          width={navCollapsed ? 96 : 320}
          bodyStyle={{ padding: 0 }}
          title="Tables"
          extra={
            <Button size="small" onClick={() => setNavCollapsed((v) => !v)}>
              {navCollapsed ? 'Expand' : 'Collapse'}
            </Button>
          }
        >
          <SchemaTableNav
            tables={tables}
            selectedKey={selectedTable ? `${selectedTable.schema}.${selectedTable.table}` : null}
            onSelect={handleSelectTable}
            collapsed={navCollapsed}
            onCollapsedChange={setNavCollapsed}
            width={navCollapsed ? 96 : 280}
            collapsedWidth={72}
          />
        </Drawer>

        <Content className="p-4" style={{ background: '#f6f8fa' }}>
          <Spin spinning={loading}>
            <div className="max-w-screen-2xl mx-auto">
              <TableSelector onQuery={handleQuery} selectedTable={selectedTable} />

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
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
