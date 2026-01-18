import { useEffect, useMemo, useState } from 'react';
import { Form, Button, Input, Card, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { TableInfo } from '../types/api';

interface TableSelectorProps {
  onQuery: (schema: string, table: string, pkValues: Record<string, string>) => void;
  selectedTable: TableInfo | null;
}

export const TableSelector = ({ onQuery, selectedTable }: TableSelectorProps) => {
  const [pkValues, setPkValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const tableLabel = useMemo(() => {
    if (!selectedTable) return null;
    return `${selectedTable.schema}.${selectedTable.table}`;
  }, [selectedTable]);

  useEffect(() => {
    setPkValues({});
  }, [tableLabel]);

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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Typography.Text type="secondary">Selected:</Typography.Text>
            {selectedTable ? (
              <Tag color="blue" className="font-mono">
                {selectedTable.schema}.{selectedTable.table}
              </Tag>
            ) : (
              <Typography.Text type="secondary">Choose a table from the left menu</Typography.Text>
            )}
          </div>
          {selectedTable && (
            <Typography.Text type="secondary" className="text-xs">
              Enter primary key values to fetch a single record.
            </Typography.Text>
          )}
        </div>
      </div>

      {selectedTable && (
        <Form layout="inline" className="w-full mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">PRIMARY KEY:</span>
            {selectedTable.pkColumns.map((col) => (
              <Form.Item key={col} label={col} className="mb-0">
                <Input
                  placeholder={col}
                  value={pkValues[col] || ''}
                  onChange={(e) => handlePkValueChange(col, e.target.value)}
                  className="w-40"
                  size="small"
                />
              </Form.Item>
            ))}

            <Form.Item className="mb-0">
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleFetch}
                loading={loading}
                disabled={!selectedTable.pkColumns.every((col) => pkValues[col])}
              >
                Fetch
              </Button>
            </Form.Item>
          </div>
        </Form>
      )}
    </Card>
  );
};
