import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios so the ApiClient's axios.create() returns a controllable instance.
// vi.hoisted lets the mock fns exist before the hoisted vi.mock factory runs.
const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: mockGet, post: mockPost })),
  },
}));

import { apiClient } from './api';

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('ApiClient', () => {
  it('listTables GETs /tables and unwraps data', async () => {
    mockGet.mockResolvedValue({ data: [{ schema: 'S', table: 'T' }] });
    const out = await apiClient.listTables();
    expect(mockGet).toHaveBeenCalledWith('/tables');
    expect(out).toEqual([{ schema: 'S', table: 'T' }]);
  });

  it('query POSTs /query/pk', async () => {
    mockPost.mockResolvedValue({ data: { rows: [] } });
    const req = { schema: 'S', table: 'T', filters: [], limit: 10 } as any;
    const out = await apiClient.query(req);
    expect(mockPost).toHaveBeenCalledWith('/query/pk', req);
    expect(out).toEqual({ rows: [] });
  });

  it('getByPk POSTs /record/get', async () => {
    mockPost.mockResolvedValue({ data: { row: { ID: 1 } } });
    const out = await apiClient.getByPk({ schema: 'S', table: 'T', pk: { ID: '1' } } as any);
    expect(mockPost).toHaveBeenCalledWith('/record/get', { schema: 'S', table: 'T', pk: { ID: '1' } });
    expect(out).toEqual({ row: { ID: 1 } });
  });

  it('validatePatch POSTs /record/validate-patch', async () => {
    mockPost.mockResolvedValue({ data: { valid: true } });
    const out = await apiClient.validatePatch({ schema: 'S', table: 'T', pk: {}, set: {} } as any);
    expect(mockPost).toHaveBeenCalledWith('/record/validate-patch', expect.any(Object));
    expect(out).toEqual({ valid: true });
  });

  it('update POSTs /record/update', async () => {
    mockPost.mockResolvedValue({ data: { updated: 1, row: {} } });
    const out = await apiClient.update({ schema: 'S', table: 'T', pk: {}, set: { A: 1 }, reason: 'r' } as any);
    expect(mockPost).toHaveBeenCalledWith('/record/update', expect.objectContaining({ reason: 'r' }));
    expect(out.updated).toBe(1);
  });

  it('insert POSTs /record/insert', async () => {
    mockPost.mockResolvedValue({ data: { inserted: 1, row: {} } });
    const out = await apiClient.insert({ schema: 'S', table: 'T', values: { A: 1 }, reason: 'r' } as any);
    expect(mockPost).toHaveBeenCalledWith('/record/insert', expect.objectContaining({ values: { A: 1 } }));
    expect(out.inserted).toBe(1);
  });

  it('getTableMetadata GETs /db/tables/{schema}/{table}', async () => {
    mockGet.mockResolvedValue({ data: { columns: [], pkColumns: [] } });
    const out = await apiClient.getTableMetadata('SCH', 'TBL');
    expect(mockGet).toHaveBeenCalledWith('/db/tables/SCH/TBL');
    expect(out.pkColumns).toEqual([]);
  });

  it('compareJob POSTs /compare/job', async () => {
    mockPost.mockResolvedValue({ data: { differences: [] } });
    const out = await apiClient.compareJob({ tableOne: 'a', tableTwo: 'b', syncPk: [], ignoreColumns: [], limit: 100 });
    expect(mockPost).toHaveBeenCalledWith('/compare/job', expect.objectContaining({ tableOne: 'a' }));
    expect(out.differences).toEqual([]);
  });

  it('validateCompare POSTs /compare/validate', async () => {
    mockPost.mockResolvedValue({ data: { valid: true } });
    const out = await apiClient.validateCompare({ tableOne: 'a', tableTwo: 'b', syncPk: [] } as any);
    expect(mockPost).toHaveBeenCalledWith('/compare/validate', expect.any(Object));
    expect(out).toEqual({ valid: true });
  });

  it('getCompareConfig GETs /compare/config', async () => {
    mockGet.mockResolvedValue({ data: [{ name: 'pair1' }] });
    const out = await apiClient.getCompareConfig();
    expect(mockGet).toHaveBeenCalledWith('/compare/config');
    expect(out).toEqual([{ name: 'pair1' }]);
  });

  it('reviewCompareRow POSTs /compare/review', async () => {
    mockPost.mockResolvedValue({ data: { pk: '1', status: 'APPROVED' } });
    const out = await apiClient.reviewCompareRow({ pk: '1', status: 'APPROVED' } as any);
    expect(mockPost).toHaveBeenCalledWith('/compare/review', expect.objectContaining({ pk: '1' }));
    expect(out.status).toBe('APPROVED');
  });

  it('health GETs /health', async () => {
    mockGet.mockResolvedValue({ data: { status: 'UP', application: 'auditpatchx' } });
    const out = await apiClient.health();
    expect(mockGet).toHaveBeenCalledWith('/health');
    expect(out.status).toBe('UP');
  });
});
