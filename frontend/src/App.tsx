import React, { useState } from 'react';
import { Layout, Typography, message, Modal, Input, Spin } from 'antd';
import { TableSelector } from './components/TableSelector';
import { DataGrid } from './components/DataGrid';
import { DiffView } from './components/DiffView';
import apiClient from './services/api';
import { getChangedFields } from './services/diffUtils';

const { Header, Content } = Layout;
const { Title } = Typography;

function App() {
  const [loading, setLoading] = useState(false);
  const [currentSchema, setCurrentSchema] = useState<string>('');
  const [currentTable, setCurrentTable] = useState<string>('');
  const [currentPk, setCurrentPk] = useState<Record<string, any>>({});
  const [pkColumns, setPkColumns] = useState<string[]>([]);

  // Grid state
  const [gridData, setGridData] = useState<Record<string, any>[]>([]);
  const [gridColumns, setGridColumns] = useState<string[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState<string>('');

  // Diff state
  const [beforeData, setBeforeData] = useState<Record<string, any>>({});
  const [afterData, setAfterData] = useState<Record<string, any>>({});
  const [showDiff, setShowDiff] = useState(false);

  const handleQuery = async (schema: string, table: string, pkValues: Record<string, string>) => {
    setLoading(true);
    try {
      // Store current context
      setCurrentSchema(schema);
      setCurrentTable(table);
      setCurrentPk(pkValues);

      // Get table metadata to know PK columns
      const metadata = await apiClient.getTableMetadata(schema, table);
      setPkColumns(metadata.pkColumns);

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
    const changedFields = getChangedFields(beforeData, afterData);

    if (Object.keys(changedFields).length === 0) {
      message.warning('No changes to apply');
      return;
    }

    // Prompt for reason
    Modal.confirm({
      title: 'Approve Changes',
      content: (
        <div>
          <p className="mb-2">You are about to update the following fields:</p>
          <ul className="list-disc list-inside mb-3">
            {Object.keys(changedFields).map((field) => (
              <li key={field} className="text-sm">
                <strong>{field}</strong>: {String(beforeData[field])} → {String(changedFields[field])}
              </li>
            ))}
          </ul>
          <Input.TextArea
            id="reason-input"
            placeholder="Enter reason for this change (required)"
            rows={3}
            className="mt-2"
          />
        </div>
      ),
      okText: 'Approve',
      cancelText: 'Cancel',
      onOk: async () => {
        const reasonInput = document.getElementById('reason-input') as HTMLTextAreaElement;
        const reason = reasonInput?.value?.trim();

        if (!reason) {
          message.error('Reason is required');
          return Promise.reject();
        }

        setLoading(true);
        try {
          const response = await apiClient.update({
            schema: currentSchema,
            table: currentTable,
            pk: currentPk,
            set: changedFields,
            reason,
          });

          message.success(`Successfully updated ${response.updated} record(s)`);

          // Refresh grid and diff with updated data
          setGridData([response.row]);
          setBeforeData(response.row);
          setAfterData(response.row);
        } catch (error: any) {
          message.error(`Update failed: ${error.response?.data?.error || error.message}`);
          throw error;
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleReject = () => {
    // Reset after to match before
    setAfterData(beforeData);
    message.info('Changes rejected');
  };

  return (
    <Layout className="min-h-screen">
      <Header className="bg-primary shadow-md">
        <Title level={3} className="text-white m-0 py-2">
          AuditPatchX - Database Configuration Manager
        </Title>
      </Header>

      <Content className="p-4">
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
                  />
                </div>
              )}
            </div>
          </div>
        </Spin>
      </Content>
    </Layout>
  );
}

export default App;
