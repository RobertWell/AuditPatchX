import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface DataGridProps {
  data: Record<string, any>[];
  columns: string[];
  onRowClick?: (row: Record<string, any>) => void;
  selectedRowKey?: string;
  themeMode?: 'light' | 'dark';
}

export const DataGrid = ({ data, columns, onRowClick, selectedRowKey, themeMode = 'light' }: DataGridProps) => {
  const tableColumns: ColumnsType<Record<string, any>> = columns.map((col) => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
    width: 150,
    render: (value: any) => {
      if (value == null) return <span className="text-gray-400 italic">null</span>;
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    },
  }));

  // Generate unique row keys
  const dataWithKeys = data.map((row, index) => ({
    ...row,
    _rowKey: JSON.stringify(row) + index,
  }));

  return (
    <div className="h-full overflow-auto app-panel">
      <Table
        columns={tableColumns}
        dataSource={dataWithKeys}
        rowKey="_rowKey"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
        onRow={(record) => ({
          onClick: () => onRowClick?.(record),
          className:
            record._rowKey === selectedRowKey
              ? themeMode === 'dark'
                ? 'bg-blue-950/40 border-l-4 border-l-blue-400'
                : 'bg-blue-50 border-l-4 border-l-blue-500'
              : themeMode === 'dark'
              ? 'cursor-pointer hover:bg-white/5'
              : 'cursor-pointer hover:bg-gray-50',
        })}
        className="text-xs"
      />
    </div>
  );
};
