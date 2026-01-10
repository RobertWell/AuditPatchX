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

  /**
   * List all allowed tables
   */
  async listTables(): Promise<TableInfo[]> {
    const response = await this.client.get<TableInfo[]>('/tables');
    return response.data;
  }

  /**
   * Query table with filters
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await this.client.post<QueryResponse>('/query/pk', request);
    return response.data;
  }

  /**
   * Get single row by primary key
   */
  async getByPk(request: GetByPkRequest): Promise<GetByPkResponse> {
    const response = await this.client.post<GetByPkResponse>('/record/get', request);
    return response.data;
  }

  /**
   * Validate patch before applying
   */
  async validatePatch(request: ValidatePatchRequest): Promise<ValidatePatchResponse> {
    const response = await this.client.post<ValidatePatchResponse>(
      '/record/validate-patch',
      request
    );
    return response.data;
  }

  /**
   * Apply update (patch)
   */
  async update(request: UpdateRequest): Promise<UpdateResponse> {
    const response = await this.client.post<UpdateResponse>('/record/update', request);
    return response.data;
  }

  /**
   * Get table metadata
   */
  async getTableMetadata(schema: string, table: string): Promise<TableMetadataResponse> {
    const response = await this.client.get<TableMetadataResponse>(
      `/db/tables/${schema}/${table}`
    );
    return response.data;
  }

  /**
   * Health check
   */
  async health(): Promise<{ status: string; application: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
