import axios, { AxiosInstance } from 'axios';
import type {
  TableInfo,
  QueryRequest,
  QueryResponse,
  GetByPkRequest,
  GetByPkResponse,
  ValidatePatchRequest,
  ValidatePatchResponse,
  UpdateRequest,
  UpdateResponse,
  TableMetadataResponse,
} from '../types/api';

const USE_MOCK = true;

// Mock Data
const MOCK_TABLES: TableInfo[] = [
  { schema: 'APP_SCHEMA', table: 'config_rules', pkColumns: ['id'] },
  { schema: 'APP_SCHEMA', table: 'workflow_def', pkColumns: ['wf_id'] },
];

const MOCK_METADATA: TableMetadataResponse = {
  pkColumns: ['id'],
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'rule_name', type: 'varchar', nullable: false },
    { name: 'status', type: 'varchar', nullable: false },
    { name: 'created_at', type: 'timestamp', nullable: false },
  ],
  readonlyColumns: ['id', 'created_at'],
};

let MOCK_RECORD = {
  id: 101,
  rule_name: 'Max Transaction Limit',
  status: 'ACTIVE',
  created_at: '2023-01-01T12:00:00Z',
};

class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = '/api') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async listTables(): Promise<TableInfo[]> {
    if (USE_MOCK) {
      return Promise.resolve(MOCK_TABLES);
    }
    const response = await this.client.get<TableInfo[]>('/tables');
    return response.data;
  }

  async query(request: QueryRequest): Promise<QueryResponse> {
    if (USE_MOCK) {
      return Promise.resolve({
        columns: ['id', 'rule_name', 'status', 'created_at'],
        rows: [MOCK_RECORD],
      });
    }
    const response = await this.client.post<QueryResponse>('/query/pk', request);
    return response.data;
  }

  async getByPk(request: GetByPkRequest): Promise<GetByPkResponse> {
    if (USE_MOCK) {
      return Promise.resolve({ row: MOCK_RECORD });
    }
    const response = await this.client.post<GetByPkResponse>('/record/get', request);
    return response.data;
  }

  async validatePatch(request: ValidatePatchRequest): Promise<ValidatePatchResponse> {
    if (USE_MOCK) {
      return Promise.resolve({ ok: true });
    }
    const response = await this.client.post<ValidatePatchResponse>('/record/validate-patch', request);
    return response.data;
  }

  async update(request: UpdateRequest): Promise<UpdateResponse> {
    if (USE_MOCK) {
      MOCK_RECORD = { ...MOCK_RECORD, ...request.set };
      return Promise.resolve({ updated: 1, row: MOCK_RECORD });
    }
    const response = await this.client.post<UpdateResponse>('/record/update', request);
    return response.data;
  }

  async getTableMetadata(schema: string, table: string): Promise<TableMetadataResponse> {
    if (USE_MOCK) {
      return Promise.resolve(MOCK_METADATA);
    }
    const response = await this.client.get<TableMetadataResponse>(`/db/tables/${schema}/${table}`);
    return response.data;
  }

  async health(): Promise<{ status: string; application: string }> {
    if (USE_MOCK) {
      return Promise.resolve({ status: 'OK', application: 'AuditPatchX Mock' });
    }
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
