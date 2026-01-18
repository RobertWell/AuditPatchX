import { useEffect, useMemo, useState } from 'react';
import { Empty, Input, Layout, Menu, Tooltip, Typography } from 'antd';
import { DatabaseOutlined, SearchOutlined, TableOutlined } from '@ant-design/icons';
import type { ItemType } from 'antd/es/menu/interface';
import type { TableInfo } from '../types/api';

interface SchemaTableNavProps {
  tables: TableInfo[];
  selectedKey: string | null;
  onSelect: (schema: string, table: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  width?: number;
  collapsedWidth?: number;
}

const toKey = (schema: string, table: string) => `${schema}.${table}`;
const schemaKey = (schema: string) => `schema:${schema}`;

export const SchemaTableNav = ({
  tables,
  selectedKey,
  onSelect,
  collapsed = false,
  onCollapsedChange,
  width = 280,
  collapsedWidth = 72,
}: SchemaTableNavProps) => {
  const [search, setSearch] = useState('');
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const normalizedSearch = search.trim().toLowerCase();

  const items: ItemType[] = useMemo(() => {
    const grouped = new Map<string, TableInfo[]>();
    for (const table of tables) {
      const list = grouped.get(table.schema) ?? [];
      list.push(table);
      grouped.set(table.schema, list);
    }

    const schemas = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

    const schemaItems = schemas.map((schema) => {
      const allTables = (grouped.get(schema) ?? []).slice().sort((a, b) => a.table.localeCompare(b.table));
      const filteredTables =
        normalizedSearch.length === 0
          ? allTables
          : allTables.filter((t) => {
              const full = `${t.schema}.${t.table}`.toLowerCase();
              return full.includes(normalizedSearch);
            });

      return {
        key: schemaKey(schema),
        icon: <DatabaseOutlined />,
        label: schema,
        children: filteredTables.map((t) => ({
          key: toKey(t.schema, t.table),
          icon: <TableOutlined />,
          label: t.table,
        })),
      } satisfies ItemType;
    });

    if (normalizedSearch.length === 0) return schemaItems;

    return schemaItems.filter((item) => {
      const children = (item as any).children as unknown[] | undefined;
      return Array.isArray(children) && children.length > 0;
    });
  }, [normalizedSearch, tables]);

  const selectedSchemaKey = useMemo(() => {
    if (!selectedKey) return [];
    const [schema] = selectedKey.split('.', 2);
    return [schemaKey(schema)];
  }, [selectedKey]);

  useEffect(() => {
    if (selectedSchemaKey.length === 0) return;
    setOpenKeys((prev) => {
      const next = new Set(prev);
      for (const k of selectedSchemaKey) next.add(k);
      return Array.from(next);
    });
  }, [selectedSchemaKey]);

  const hasAnyMatches = useMemo(() => {
    if (!normalizedSearch) return tables.length > 0;
    return tables.some((t) => `${t.schema}.${t.table}`.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, tables]);

  const searchOpenKeys = useMemo(() => {
    if (!normalizedSearch) return [];
    return items.map((i) => String((i as any).key));
  }, [items, normalizedSearch]);

  const effectiveOpenKeys = collapsed ? [] : normalizedSearch ? searchOpenKeys : openKeys;

  return (
    <Layout.Sider
      width={width}
      collapsedWidth={collapsedWidth}
      collapsible
      collapsed={collapsed}
      onCollapse={(next) => onCollapsedChange?.(next)}
      theme="light"
      className="schema-nav-sider"
      style={{
        background: '#ffffff',
      }}
    >
      <div className="schema-nav-header" style={{ padding: collapsed ? 10 : 12 }}>
        {collapsed ? (
          <Tooltip title="Schemas / Tables" placement="right">
            <div className="schema-nav-header-collapsed">
              <DatabaseOutlined />
            </div>
          </Tooltip>
        ) : (
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            Schemas / Tables
          </Typography.Text>
        )}

        {!collapsed && (
          <Input
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Search schema.table"
            size="middle"
          />
        )}
      </div>

      {!hasAnyMatches ? (
        <div style={{ padding: 16 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span>No tables match “{search.trim()}”</span>}
          />
        </div>
      ) : (
        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={selectedKey ? [selectedKey] : []}
          openKeys={effectiveOpenKeys}
          onOpenChange={(keys) => {
            if (collapsed || normalizedSearch) return;
            setOpenKeys(keys.map(String));
          }}
          items={items}
          onClick={(e) => {
            const key = String(e.key);
            if (!key.includes('.')) return;
            const [schema, table] = key.split('.', 2);
            onSelect(schema, table);
          }}
          style={{ borderRight: 0 }}
        />
      )}
    </Layout.Sider>
  );
};
