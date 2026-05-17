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
          pk: 'PKG_ACCOUNT_PROC',
          status: 'UPDATE',
          changedColumns: 2,
          updatedBy: 'jane.smith',
          reviewStatus: 'PENDING',
          changes: [
            {
              column: 'STATUS',
              sourceValue: 'ACTIVE',
              targetValue: 'INACTIVE',
              isLongText: false
            },
            {
              column: 'PROCEDURE_BODY',
              sourceValue: 'CREATE OR REPLACE PROCEDURE update_account_status(p_acc_id IN NUMBER)\nIS\nBEGIN\n  UPDATE accounts SET status = \'ACTIVE\' WHERE id = p_acc_id;\n  COMMIT;\nEND;',
              targetValue: 'CREATE OR REPLACE PROCEDURE update_account_status(p_acc_id IN NUMBER)\nIS\nBEGIN\n  -- Added validation\n  IF p_acc_id IS NULL THEN\n    RAISE_APPLICATION_ERROR(-20001, \'Account ID cannot be null\');\n  END IF;\n  UPDATE accounts SET status = \'INACTIVE\', updated_at = SYSDATE WHERE id = p_acc_id;\n  COMMIT;\nEND;',
              isLongText: true
            }
          ]
        },
        {
          pk: 'IDX_TRANS_DATE',
          status: 'INSERT',
          changedColumns: 1,
          updatedBy: 'system',
          reviewStatus: 'APPROVED',
          changes: [
            {
              column: 'DDL_STATEMENT',
              sourceValue: null,
              targetValue: 'CREATE INDEX idx_trans_date ON transactions(created_date DESC, status) TABLESPACE users;',
              isLongText: true
            }
          ]
        },
        {
          pk: 'JSON_CONFIG_22',
          status: 'CONFLICT',
          changedColumns: 1,
          updatedBy: 'bob.jones',
          reviewStatus: 'REJECTED',
          changes: [
            {
              column: 'RULES_PAYLOAD',
              sourceValue: '{\n  "maxLimit": 5000,\n  "currency": "USD",\n  "flags": ["auto_approve"]\n}',
              targetValue: '{\n  "maxLimit": 10000,\n  "currency": "USD",\n  "flags": ["requires_manager", "auto_notify"]\n}',
              isLongText: true
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
