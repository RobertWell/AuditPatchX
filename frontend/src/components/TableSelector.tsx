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
      <Form layout="inline" className="w-full">
        <Form.Item label="Table" className="flex-1">
          <Select
            placeholder="Select a table"
            onChange={handleTableChange}
            value={selectedTable ? `${selectedTable.schema}.${selectedTable.table}` : undefined}
            className="w-64"
          >
            {tables.map((table) => (
              <Select.Option key={`${table.schema}.${table.table}`} value={`${table.schema}.${table.table}`}>
                {table.schema}.{table.table}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {selectedTable && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">PRIMARY KEY:</span>
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

            <Form.Item>
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
          </>
        )}
      </Form>
    </Card>
  );
};
