import { http, HttpResponse } from 'msw';

let MOCK_RECORD = {
  id: 101,
  rule_name: 'Max Transaction Limit',
  status: 'ACTIVE',
  created_at: '2023-01-01T12:00:00Z',
};

const MOCK_TABLES = [
  { schema: 'APP_SCHEMA', table: 'config_rules', pkColumns: ['id'] },
  { schema: 'APP_SCHEMA', table: 'workflow_def', pkColumns: ['wf_id'] },
];

const MOCK_METADATA = {
  pkColumns: ['id'],
  columns: [
    { name: 'id', type: 'integer', nullable: false },
    { name: 'rule_name', type: 'varchar', nullable: false },
    { name: 'status', type: 'varchar', nullable: false },
    { name: 'created_at', type: 'timestamp', nullable: false },
  ],
  readonlyColumns: ['id', 'created_at'],
};

export const handlers = [
  http.get('/api/tables', () => {
    return HttpResponse.json(MOCK_TABLES);
  }),

  http.post('/api/query/pk', () => {
    return HttpResponse.json({
      columns: ['id', 'rule_name', 'status', 'created_at'],
      rows: [MOCK_RECORD],
    });
  }),

  http.post('/api/record/get', () => {
    return HttpResponse.json({ row: MOCK_RECORD });
  }),

  http.post('/api/record/validate-patch', () => {
    return HttpResponse.json({ ok: true });
  }),

  http.post('/api/record/update', async ({ request }) => {
    const data = await request.json() as any;
    MOCK_RECORD = { ...MOCK_RECORD, ...data.set };
    return HttpResponse.json({ updated: 1, row: MOCK_RECORD });
  }),

  http.get('/api/db/tables/:schema/:table', () => {
    return HttpResponse.json(MOCK_METADATA);
  }),

  http.post('/api/compare/job', () => {
    return HttpResponse.json({
      differences: [
        {
          pk: 'MOCK_PK_1',
          status: 'UPDATE',
          changedColumns: 1,
          updatedBy: 'john.doe',
          reviewStatus: 'PENDING',
          changes: [
            {
              column: 'mock_column',
              sourceValue: 'old_value',
              targetValue: 'new_value',
              isLongText: false
            }
          ]
        }
      ]
    });
  }),

  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'OK', application: 'AuditPatchX MSW Mock' });
  }),
];
