export interface TableInfo {
  schema: string;
  table: string;
  pkColumns: string[];
}

export interface FilterCondition {
  col: string;
  op: 'eq' | 'contains' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte';
  value: any;
}

export interface QueryRequest {
  schema: string;
  table: string;
  filters?: FilterCondition[];
  limit?: number;
}

export interface QueryResponse {
  columns: string[];
  rows: Record<string, any>[];
}

export interface GetByPkRequest {
  schema: string;
  table: string;
  pk: Record<string, any>;
}

export interface GetByPkResponse {
  row: Record<string, any>;
}

export interface ValidatePatchRequest {
  schema: string;
  table: string;
  pk: Record<string, any>;
  set: Record<string, any>;
}

export interface ValidatePatchResponse {
  ok: boolean;
  normalizedSet?: Record<string, any>;
  rejectedFields?: string[];
  warnings?: string[];
  error?: string;
}

export interface UpdateRequest {
  schema: string;
  table: string;
  pk: Record<string, any>;
  set: Record<string, any>;
  reason: string;
}

export interface UpdateResponse {
  updated: number;
  row: Record<string, any>;
}

export interface ColumnMetadata {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DiffPolicy {
  excludeTypes?: string[];
  excludeColumns?: string[];
  includeColumns?: string[];
}

export interface TableMetadataResponse {
  pkColumns: string[];
  columns: ColumnMetadata[];
  readonlyColumns?: string[];
  diffPolicy?: DiffPolicy;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}
