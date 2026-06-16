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

export interface InsertRequest {
  schema: string;
  table: string;
  values: Record<string, any>;
  reason: string;
}

export interface InsertResponse {
  inserted: number;
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

export interface CompareJobRequest {
  tableOne: string;
  tableTwo: string;
  syncPk: string[];
  ignoreColumns: string[];
  limit: number;
  // Per-PK partial filters. Blank value = wildcard (match all).
  pkFilter?: Record<string, string>;
}

export interface CompareJobChange {
  column: string;
  sourceValue: string;
  targetValue: string;
  isLongText: boolean;
}

export interface CompareJobDiffRow {
  pk: string;
  pkMap: Record<string, string>;
  status: 'INSERT' | 'UPDATE' | 'DELETE' | 'CONFLICT' | 'IGNORED';
  changedColumns: number;
  updatedBy: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  changes: CompareJobChange[];
}

export interface CompareJobResponse {
  differences: CompareJobDiffRow[];
  scannedRows: number;
  limitReached: boolean;
}

export interface ColumnTypeMismatch {
  column: string;
  tableOneType: string;
  tableTwoType: string;
}

export interface CompareValidationRequest {
  tableOne: string;
  tableTwo: string;
}

export interface CompareValidationResponse {
  compatible: boolean;
  pkMatch: boolean;
  columnTypeMatch: boolean;
  missingInTableOne: string[];
  missingInTableTwo: string[];
  mismatchedTypes: ColumnTypeMismatch[];
  details: string;
}

export interface SyncPairConfigInfo {
  pairName: string;
  db: string;
  tableA: string;
  tableB: string;
  pkColumns: string[];
  excludeColumns: string[];
  validation: CompareValidationResponse;
}

export interface CompareReviewRequest {
  pk: string;
  status: 'APPROVED' | 'REJECTED';
  tableOne: string;
  tableTwo: string;
  rowStatus: string;
  syncPk: string[];
  ignoreColumns: string[];
  pkMap: Record<string, string>;
}

export interface CompareReviewResponse {
  pk: string;
  status: string;
}
