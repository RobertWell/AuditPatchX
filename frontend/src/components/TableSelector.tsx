import { useEffect, useState } from 'react';
import { Select, Form, Button, Input, Card } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { TableInfo } from '../types/api';
import apiClient from '../services/api';

interface TableSelectorProps {
  onQuery: (schema: string, table: string, pkValues: Record<string, string>) => void;
}

export const TableSelector = ({ onQuery }: TableSelectorProps) => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [pkValues, setPkValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      const data = await apiClient.listTables();
      setTables(data);
    } catch (error) {
      console.error('Failed to load tables:', error);
    }
  };

  const handleTableChange = (value: string) => {
    const table = tables.find((t) => `${t.schema}.${t.table}` === value);
    setSelectedTable(table || null);
    setPkValues({});
  };

  const handlePkValueChange = (column: string, value: string) => {
    setPkValues((prev) => ({ ...prev, [column]: value }));
  };

  const handleFetch = () => {
    if (!selectedTable) return;

    // Check if all PK values are provided
    const allPkProvided = selectedTable.pkColumns.every((col) => pkValues[col]);
    if (!allPkProvided) {
      return;
    }

    setLoading(true);
    onQuery(selectedTable.schema, selectedTable.table, pkValues);
    setLoading(false);
  };

  return (
    <Card className="mb-4" size="small">
      <Form layout="vertical" className="w-full">
        <Form.Item label="Table" className="mb-3 w-full">
          <Select
            placeholder="Select a table"
            onChange={handleTableChange}
            value={selectedTable ? `${selectedTable.schema}.${selectedTable.table}` : undefined}
            className="w-full"
            popupMatchSelectWidth={false}
            optionLabelProp="label"
          >
            {tables.map((table) => (
              <Select.Option
                key={`${table.schema}.${table.table}`}
                value={`${table.schema}.${table.table}`}
                label={`${table.schema}.${table.table}`}
              >
                <div className="min-w-[28rem] font-mono text-sm">
                  {table.schema}.{table.table}
                </div>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {selectedTable && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <span className="mb-1 w-full text-xs font-semibold uppercase text-gray-500">Primary Key</span>
              {selectedTable.pkColumns.map((col) => (
                <Form.Item key={col} label={col} className="mb-0">
                  <Input
                    placeholder={col}
                    value={pkValues[col] || ''}
                    onChange={(e) => handlePkValueChange(col, e.target.value)}
                    className="w-32"
                    size="small"
                  />
                </Form.Item>
              ))}
            </div>

            <Form.Item className="mb-0">
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleFetch}
                loading={loading}
                disabled={!selectedTable.pkColumns.every((col) => pkValues[col])}
              >
                FETCH
              </Button>
            </Form.Item>
          </div>
        )}
      </Form>
    </Card>
  );
};
