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
  CompareJobRequest,
  CompareJobResponse,
  CompareValidationRequest,
  CompareValidationResponse,
  SyncPairConfigInfo,
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

  async listTables(): Promise<TableInfo[]> {
    const response = await this.client.get<TableInfo[]>('/tables');
    return response.data;
  }

  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await this.client.post<QueryResponse>('/query/pk', request);
    return response.data;
  }

  async getByPk(request: GetByPkRequest): Promise<GetByPkResponse> {
    const response = await this.client.post<GetByPkResponse>('/record/get', request);
    return response.data;
  }

  async validatePatch(request: ValidatePatchRequest): Promise<ValidatePatchResponse> {
    const response = await this.client.post<ValidatePatchResponse>('/record/validate-patch', request);
    return response.data;
  }

  async update(request: UpdateRequest): Promise<UpdateResponse> {
    const response = await this.client.post<UpdateResponse>('/record/update', request);
    return response.data;
  }

  async getTableMetadata(schema: string, table: string): Promise<TableMetadataResponse> {
    const response = await this.client.get<TableMetadataResponse>(`/db/tables/${schema}/${table}`);
    return response.data;
  }

  async compareJob(request: CompareJobRequest): Promise<CompareJobResponse> {
    const response = await this.client.post<CompareJobResponse>('/compare/job', request);
    return response.data;
  }

  async validateCompare(request: CompareValidationRequest): Promise<CompareValidationResponse> {
    const response = await this.client.post<CompareValidationResponse>('/compare/validate', request);
    return response.data;
  }

  async getCompareConfig(): Promise<SyncPairConfigInfo[]> {
    const response = await this.client.get<SyncPairConfigInfo[]>('/compare/config');
    return response.data;
  }

  async health(): Promise<{ status: string; application: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
