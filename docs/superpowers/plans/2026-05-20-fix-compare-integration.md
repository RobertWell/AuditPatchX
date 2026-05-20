# Compare Job Integration Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all dead buttons, missing API wiring, empty INSERT rows, and missing navigation in the Compare Job and SyncHistory features.

**Architecture:** Seven self-contained tasks: backend model/service changes first (Tasks 1, 4), then frontend selection logic (Task 2), then prop wiring (Tasks 3, 5), then pure-frontend features (Task 6), and finally navigation (Task 7). Each task is independently testable.

**Tech Stack:** Kotlin/Quarkus (backend), React 18 + Vitest + axios (frontend), Oracle JDBC

---

## File Map

**Create:**
- `frontend/src/services/exportSql.ts` — generates SQL UPDATE/INSERT/DELETE text from diff rows
- `frontend/src/services/exportSql.test.ts` — unit tests for SQL generation

**Modify:**
- `backend/src/main/kotlin/com/auditpatchx/model/ApiModels.kt` — add `CompareReviewRequest`; add `pkMap` field to `CompareJobDiffRow`
- `backend/src/main/kotlin/com/auditpatchx/service/DatabaseService.kt` — populate INSERT row `changes`; populate `pkMap`; add in-memory review store + `reviewCompareRow()`; apply stored status in `compareTables()`
- `backend/src/main/kotlin/com/auditpatchx/resource/TableResource.kt` — add `POST /api/compare/review` endpoint
- `frontend/src/types/api.ts` — add `CompareReviewRequest`; add `pkMap` to `CompareJobDiffRow`
- `frontend/src/services/api.ts` — add `reviewCompareRow()` method
- `frontend/src/components/diffResultSelection.ts` — fix `canBulkApprove` to allow single-row
- `frontend/src/components/diffResultSelection.test.ts` — update assertions for new `canBulkApprove` behavior
- `frontend/src/components/DiffResult.tsx` — add `onRowApprove`, `onRowReject`, `onExportSql` props; wire all dead buttons; update `handleBulkApproveSelected` guard
- `frontend/src/components/Sidebar.tsx` — add "Sync History" nav item
- `frontend/src/App.tsx` — add `currentCompareConfig` state; implement `handleRowApprove`, `handleRowReject`, `handleExportSql`; wire new props; add `case 'history'` to `renderContent`

---

## Task 1: Fix INSERT row changes + add pkMap to backend response

**Files:**
- Modify: `backend/src/main/kotlin/com/auditpatchx/model/ApiModels.kt`
- Modify: `backend/src/main/kotlin/com/auditpatchx/service/DatabaseService.kt:273-316`

**Context:** `compareTables()` builds `CompareJobDiffRow` for INSERT rows with `changes = emptyList()`, so expanding an INSERT row shows nothing. Also, the `pk` field is a `-`-joined string with no way to parse it back into column→value pairs needed for SQL export. Fix both by (a) populating INSERT changes from all source columns and (b) adding a `pkMap: Map<String, String>` field to carry the pk values explicitly.

- [ ] **Step 1: Add `pkMap` field to `CompareJobDiffRow` in ApiModels.kt**

In `backend/src/main/kotlin/com/auditpatchx/model/ApiModels.kt`, find the `CompareJobDiffRow` data class and add `pkMap`:

```kotlin
data class CompareJobDiffRow(
    val pk: String,
    val pkMap: Map<String, String>,
    val status: String,
    val changedColumns: Int,
    val updatedBy: String,
    val reviewStatus: String,
    val changes: List<CompareJobChange>
)
```

- [ ] **Step 2: Fix INSERT row construction in DatabaseService.kt**

In `backend/src/main/kotlin/com/auditpatchx/service/DatabaseService.kt`, find the INSERT branch (around line 273) and replace it:

```kotlin
if (!targetRowOpt.isPresent) {
    val insertChanges = sourceRow
        .filter { (col, _) -> !request.syncPk.map { it.uppercase() }.contains(col) }
        .map { (col, srcVal) ->
            CompareJobChange(
                column = col,
                sourceValue = srcVal?.toString() ?: "NULL",
                targetValue = "NULL",
                isLongText = (srcVal?.toString()?.length ?: 0) > 100
            )
        }
    differences.add(
        CompareJobDiffRow(
            pk = pkString,
            pkMap = request.syncPk.associateWith { pkValues[it]?.toString() ?: "" },
            status = "INSERT",
            changedColumns = insertChanges.size,
            updatedBy = "system",
            reviewStatus = "PENDING",
            changes = insertChanges
        )
    )
```

- [ ] **Step 3: Add `pkMap` to UPDATE row construction in DatabaseService.kt**

Still in the same method, find the UPDATE branch (the `if (changes.isNotEmpty())` block around line 306) and add `pkMap`:

```kotlin
if (changes.isNotEmpty()) {
    differences.add(
        CompareJobDiffRow(
            pk = pkString,
            pkMap = request.syncPk.associateWith { pkValues[it]?.toString() ?: "" },
            status = "UPDATE",
            changedColumns = changes.size,
            updatedBy = "system",
            reviewStatus = "PENDING",
            changes = changes
        )
    )
}
```

- [ ] **Step 4: Run backend tests to verify no breakage**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/backend
./mvnw test -pl . 2>&1 | tail -30
```

Expected: BUILD SUCCESS (or only pre-existing failures). If new failures appear due to `pkMap` field, check the test fixtures.

- [ ] **Step 5: Commit**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX
git add backend/src/main/kotlin/com/auditpatchx/model/ApiModels.kt \
        backend/src/main/kotlin/com/auditpatchx/service/DatabaseService.kt
git commit -m "fix: populate INSERT row changes and add pkMap to compare diff response"
```

---

## Task 2: Fix single-row selection approve path

**Files:**
- Modify: `frontend/src/components/diffResultSelection.ts:15`
- Modify: `frontend/src/components/diffResultSelection.test.ts:43-48`

**Context:** `canBulkApprove: selectedRows > 1` disables "Approve Selected" when exactly 1 row is selected. This leaves no direct approve path for single rows (the per-row buttons are dead — fixed in Task 3). Change to `>= 1` and update the guard in DiffResult.tsx.

- [ ] **Step 1: Update the test first (TDD)**

In `frontend/src/components/diffResultSelection.test.ts`, update the assertion for `selectedRows === 1` (currently expects `canBulkApprove: false`):

```typescript
expect(getSelectionState(2, 1)).toEqual({
  checked: false,
  indeterminate: true,
  canReviewSingle: true,
  canBulkApprove: true,   // changed: single row can now be approved directly
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/frontend
npm test -- diffResultSelection
```

Expected: FAIL — `canBulkApprove` expected true but received false.

- [ ] **Step 3: Fix `canBulkApprove` in diffResultSelection.ts**

In `frontend/src/components/diffResultSelection.ts`, change line 15:

```typescript
export function getSelectionState(totalRows: number, selectedRows: number): SelectionState {
  return {
    checked: totalRows > 0 && selectedRows === totalRows,
    indeterminate: selectedRows > 0 && selectedRows < totalRows,
    canReviewSingle: selectedRows === 1,
    canBulkApprove: selectedRows >= 1,   // was: selectedRows > 1
  };
}
```

- [ ] **Step 4: Update the guard in DiffResult.tsx**

In `frontend/src/components/DiffResult.tsx`, update the `handleBulkApproveSelected` guard (line 93):

```typescript
const handleBulkApproveSelected = () => {
  if (selectedRowData.length === 0) return;   // was: selectedRows.length <= 1
  onBulkApproveSelected?.(selectedRowData);
};
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/frontend
npm test -- diffResultSelection
```

Expected: PASS (all 3 test cases green).

- [ ] **Step 6: Commit**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX
git add frontend/src/components/diffResultSelection.ts \
        frontend/src/components/diffResultSelection.test.ts \
        frontend/src/components/DiffResult.tsx
git commit -m "fix: allow single-row selection for approve action"
```

---

## Task 3: Wire per-row Approve/Reject buttons

**Files:**
- Modify: `frontend/src/components/DiffResult.tsx`
- Modify: `frontend/src/App.tsx`

**Context:** The "Approve" and "Reject" buttons in each row's Actions column have no `onClick`. They need `onRowApprove` and `onRowReject` props on DiffResult, handled in App.tsx to update local state. The API call will be added in Task 5 once the endpoint exists.

- [ ] **Step 1: Add props to DiffResult interface**

In `frontend/src/components/DiffResult.tsx`, update `DiffResultProps`:

```typescript
interface DiffResultProps {
  data: CompareJobDiffRow[];
  onOpenSqlReview: (row: CompareJobDiffRow, column: string) => void;
  onReviewSelected?: (row: CompareJobDiffRow, column: string) => void;
  onBulkApproveSelected?: (selectedRows: CompareJobDiffRow[]) => void;
  onRowApprove?: (row: CompareJobDiffRow) => void;
  onRowReject?: (row: CompareJobDiffRow) => void;
}
```

Update the destructured props in the function signature:

```typescript
export function DiffResult({
  data,
  onOpenSqlReview,
  onReviewSelected,
  onBulkApproveSelected,
  onRowApprove,
  onRowReject,
}: DiffResultProps) {
```

- [ ] **Step 2: Wire the row-level Approve/Reject buttons**

In `frontend/src/components/DiffResult.tsx`, find the Actions column (around line 232) and replace the two dead buttons:

```tsx
<td className="p-3">
  <div className="flex gap-1">
    <Button
      size="sm"
      variant="ghost"
      className="text-green-600 hover:text-green-700"
      onClick={() => onRowApprove?.(row)}
    >
      Approve
    </Button>
    <Button
      size="sm"
      variant="ghost"
      className="text-red-600 hover:text-red-700"
      onClick={() => onRowReject?.(row)}
    >
      Reject
    </Button>
  </div>
</td>
```

- [ ] **Step 3: Implement handlers in App.tsx**

In `frontend/src/App.tsx`, add `handleRowApprove` and `handleRowReject` after `handleBulkApproveSelected` (around line 104):

```typescript
const handleRowApprove = (row: CompareJobDiffRow) => {
  setCompareData((rows) =>
    rows.map((r) => r.pk === row.pk ? { ...r, reviewStatus: 'APPROVED' } : r)
  );
  message.success(`Row ${row.pk} approved`);
};

const handleRowReject = (row: CompareJobDiffRow) => {
  setCompareData((rows) =>
    rows.map((r) => r.pk === row.pk ? { ...r, reviewStatus: 'REJECTED' } : r)
  );
  message.info(`Row ${row.pk} rejected`);
};
```

- [ ] **Step 4: Pass the new props to DiffResult in App.tsx**

In `frontend/src/App.tsx`, find the `<DiffResult ...>` JSX (around line 355) and add the two new props:

```tsx
<DiffResult
  data={compareData}
  onOpenSqlReview={handleOpenSqlReview}
  onReviewSelected={handleReviewSelected}
  onBulkApproveSelected={handleBulkApproveSelected}
  onRowApprove={handleRowApprove}
  onRowReject={handleRowReject}
/>
```

- [ ] **Step 5: Commit**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX
git add frontend/src/components/DiffResult.tsx \
        frontend/src/App.tsx
git commit -m "fix: wire per-row Approve/Reject buttons in DiffResult"
```

---

## Task 4: Add backend review persistence endpoint

**Files:**
- Modify: `backend/src/main/kotlin/com/auditpatchx/model/ApiModels.kt`
- Modify: `backend/src/main/kotlin/com/auditpatchx/service/DatabaseService.kt`
- Modify: `backend/src/main/kotlin/com/auditpatchx/resource/TableResource.kt`

**Context:** There is no backend endpoint to persist review decisions. Add `POST /api/compare/review` backed by an in-memory `ConcurrentHashMap<String, String>` in `DatabaseService`. The key is `pk` (the pk string), value is `"APPROVED"` or `"REJECTED"`. `compareTables()` reads from this store when building `reviewStatus`.

- [ ] **Step 1: Add CompareReviewRequest to ApiModels.kt**

In `backend/src/main/kotlin/com/auditpatchx/model/ApiModels.kt`, append at the end of the file:

```kotlin
data class CompareReviewRequest(
    val pk: String,
    val status: String  // "APPROVED" or "REJECTED"
)

data class CompareReviewResponse(
    val pk: String,
    val status: String
)
```

- [ ] **Step 2: Add in-memory review store to DatabaseService**

In `backend/src/main/kotlin/com/auditpatchx/service/DatabaseService.kt`, add the import and field after the `jdbi` field declaration:

```kotlin
import java.util.concurrent.ConcurrentHashMap

// Inside the class body, after private val jdbi:
private val reviewStore = ConcurrentHashMap<String, String>()
```

Add the `reviewCompareRow` function at the end of `DatabaseService` (before the closing `}`):

```kotlin
fun reviewCompareRow(request: CompareReviewRequest): CompareReviewResponse {
    if (request.status !in setOf("APPROVED", "REJECTED")) {
        throw IllegalArgumentException("status must be APPROVED or REJECTED")
    }
    reviewStore[request.pk] = request.status
    return CompareReviewResponse(pk = request.pk, status = request.status)
}
```

- [ ] **Step 3: Apply stored review status in compareTables()**

In `DatabaseService.compareTables()`, replace both `reviewStatus = "PENDING"` literals with a lookup from the store. The INSERT row construction becomes:

```kotlin
differences.add(
    CompareJobDiffRow(
        pk = pkString,
        pkMap = request.syncPk.associateWith { pkValues[it]?.toString() ?: "" },
        status = "INSERT",
        changedColumns = insertChanges.size,
        updatedBy = "system",
        reviewStatus = reviewStore.getOrDefault(pkString, "PENDING"),
        changes = insertChanges
    )
)
```

The UPDATE row construction becomes:

```kotlin
differences.add(
    CompareJobDiffRow(
        pk = pkString,
        pkMap = request.syncPk.associateWith { pkValues[it]?.toString() ?: "" },
        status = "UPDATE",
        changedColumns = changes.size,
        updatedBy = "system",
        reviewStatus = reviewStore.getOrDefault(pkString, "PENDING"),
        changes = changes
    )
)
```

- [ ] **Step 4: Add the endpoint to TableResource.kt**

In `backend/src/main/kotlin/com/auditpatchx/resource/TableResource.kt`, add after the `getCompareConfig()` function (before the closing `}`):

```kotlin
/**
 * POST /api/compare/review - Persist a review decision for a compare diff row
 */
@POST
@Path("/compare/review")
fun reviewCompareRow(request: CompareReviewRequest): Response {
    return try {
        val result = databaseService.reviewCompareRow(request)
        Response.ok(result).build()
    } catch (e: IllegalArgumentException) {
        Response.status(Response.Status.BAD_REQUEST)
            .entity(ErrorResponse(e.message ?: "Invalid request"))
            .build()
    } catch (e: Exception) {
        logger.error("Review failed", e)
        Response.status(Response.Status.INTERNAL_SERVER_ERROR)
            .entity(ErrorResponse("Review failed"))
            .build()
    }
}
```

- [ ] **Step 5: Run backend tests**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/backend
./mvnw test -pl . 2>&1 | tail -30
```

Expected: BUILD SUCCESS.

- [ ] **Step 6: Commit**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX
git add backend/src/main/kotlin/com/auditpatchx/model/ApiModels.kt \
        backend/src/main/kotlin/com/auditpatchx/service/DatabaseService.kt \
        backend/src/main/kotlin/com/auditpatchx/resource/TableResource.kt
git commit -m "feat: add in-memory review persistence and POST /api/compare/review endpoint"
```

---

## Task 5: Wire frontend approve/reject flows to the review API

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/App.tsx`

**Context:** All three approve paths (bulk, per-row, SQL review panel) currently only update local React state. Wire each one to call `POST /api/compare/review` for every affected row, then update local state on success. On API error, show an error toast and do NOT update local state.

- [ ] **Step 1: Add types to types/api.ts**

In `frontend/src/types/api.ts`, add `pkMap` to `CompareJobDiffRow` and append new types at the end:

```typescript
export interface CompareJobDiffRow {
  pk: string;
  pkMap: Record<string, string>;   // add this field
  status: 'INSERT' | 'UPDATE' | 'DELETE' | 'CONFLICT' | 'IGNORED';
  changedColumns: number;
  updatedBy: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  changes: CompareJobChange[];
}

export interface CompareReviewRequest {
  pk: string;
  status: 'APPROVED' | 'REJECTED';
}

export interface CompareReviewResponse {
  pk: string;
  status: string;
}
```

- [ ] **Step 2: Add `reviewCompareRow` to api.ts**

In `frontend/src/services/api.ts`, add the import for the new types and a new method to `ApiClient`:

First update the import block:
```typescript
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
  CompareReviewRequest,
  CompareReviewResponse,
} from '../types/api';
```

Then add the method inside the `ApiClient` class after `getCompareConfig()`:

```typescript
async reviewCompareRow(request: CompareReviewRequest): Promise<CompareReviewResponse> {
  const response = await this.client.post<CompareReviewResponse>('/compare/review', request);
  return response.data;
}
```

- [ ] **Step 3: Update `handleBulkApproveSelected` in App.tsx to call API**

In `frontend/src/App.tsx`, replace the existing `handleBulkApproveSelected` (lines 89-104) with an async version that calls the API for each selected row:

```typescript
const handleBulkApproveSelected = async (selectedRows: CompareJobDiffRow[]) => {
  if (selectedRows.length === 0) {
    message.warning('No rows selected');
    return;
  }
  try {
    await Promise.all(
      selectedRows.map((row) =>
        apiClient.reviewCompareRow({ pk: row.pk, status: 'APPROVED' })
      )
    );
    setCompareData((rows) =>
      rows.map((row) =>
        selectedRows.some((s) => s.pk === row.pk)
          ? { ...row, reviewStatus: 'APPROVED' }
          : row
      )
    );
    message.success(`Approved ${selectedRows.length} selected item(s)`);
  } catch (error: any) {
    message.error(`Approve failed: ${error.response?.data?.error || error.message}`);
  }
};
```

- [ ] **Step 4: Update `handleRowApprove` and `handleRowReject` in App.tsx to call API**

Replace the handlers added in Task 3 with async versions:

```typescript
const handleRowApprove = async (row: CompareJobDiffRow) => {
  try {
    await apiClient.reviewCompareRow({ pk: row.pk, status: 'APPROVED' });
    setCompareData((rows) =>
      rows.map((r) => r.pk === row.pk ? { ...r, reviewStatus: 'APPROVED' } : r)
    );
    message.success(`Row ${row.pk} approved`);
  } catch (error: any) {
    message.error(`Approve failed: ${error.response?.data?.error || error.message}`);
  }
};

const handleRowReject = async (row: CompareJobDiffRow) => {
  try {
    await apiClient.reviewCompareRow({ pk: row.pk, status: 'REJECTED' });
    setCompareData((rows) =>
      rows.map((r) => r.pk === row.pk ? { ...r, reviewStatus: 'REJECTED' } : r)
    );
    message.info(`Row ${row.pk} rejected`);
  } catch (error: any) {
    message.error(`Reject failed: ${error.response?.data?.error || error.message}`);
  }
};
```

- [ ] **Step 5: Update `handleSubmitSqlReview` in App.tsx to call API**

Replace the existing `handleSubmitSqlReview` (lines 66-83) with:

```typescript
const handleSubmitSqlReview = async (review: {
  rowId: string;
  column: string;
  decision: 'approved' | 'rejected';
  comment: string;
}) => {
  const status = review.decision === 'approved' ? 'APPROVED' : 'REJECTED';
  try {
    await apiClient.reviewCompareRow({ pk: review.rowId, status });
    setCompareData((rows) =>
      rows.map((row) =>
        row.pk === review.rowId ? { ...row, reviewStatus: status } : row
      )
    );
    message.success(`${review.column} review ${review.decision}`);
    handleCloseSqlReview();
  } catch (error: any) {
    message.error(`Review submit failed: ${error.response?.data?.error || error.message}`);
  }
};
```

- [ ] **Step 6: Run frontend tests**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/frontend
npm test
```

Expected: All tests pass (diffResultSelection + sqlReviewDiff).

- [ ] **Step 7: Commit**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX
git add frontend/src/types/api.ts \
        frontend/src/services/api.ts \
        frontend/src/App.tsx
git commit -m "fix: wire all approve/reject flows to POST /api/compare/review"
```

---

## Task 6: Implement Export SQL

**Files:**
- Create: `frontend/src/services/exportSql.ts`
- Create: `frontend/src/services/exportSql.test.ts`
- Modify: `frontend/src/components/DiffResult.tsx`
- Modify: `frontend/src/App.tsx`

**Context:** The "Export SQL" button has no handler. It should generate SQL UPDATE/INSERT statements from the compare diff rows and trigger a browser file download. The `pkMap` field (from Task 1/5) provides clean column→value pairs for WHERE clauses. The target table (`tableTwo`) comes from the compare config saved in App.tsx state.

- [ ] **Step 1: Write failing tests for exportSql.ts**

Create `frontend/src/services/exportSql.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { generateExportSql } from './exportSql';
import type { CompareJobDiffRow, CompareJobRequest } from '../types/api';

const config: CompareJobRequest = {
  tableOne: 'schema1.employees',
  tableTwo: 'schema2.employees',
  syncPk: ['id'],
  ignoreColumns: [],
  limit: 100,
};

const updateRow: CompareJobDiffRow = {
  pk: '42',
  pkMap: { id: '42' },
  status: 'UPDATE',
  changedColumns: 2,
  updatedBy: 'system',
  reviewStatus: 'APPROVED',
  changes: [
    { column: 'NAME', sourceValue: 'Alice', targetValue: 'Alicia', isLongText: false },
    { column: 'DEPT', sourceValue: 'Eng', targetValue: 'Engineering', isLongText: false },
  ],
};

const insertRow: CompareJobDiffRow = {
  pk: '99',
  pkMap: { id: '99' },
  status: 'INSERT',
  changedColumns: 2,
  updatedBy: 'system',
  reviewStatus: 'PENDING',
  changes: [
    { column: 'NAME', sourceValue: 'Bob', targetValue: 'NULL', isLongText: false },
    { column: 'DEPT', sourceValue: 'HR', targetValue: 'NULL', isLongText: false },
  ],
};

describe('generateExportSql', () => {
  it('generates UPDATE statement for UPDATE rows', () => {
    const sql = generateExportSql([updateRow], config);
    expect(sql).toContain("UPDATE schema2.employees");
    expect(sql).toContain("NAME = 'Alice'");
    expect(sql).toContain("DEPT = 'Eng'");
    expect(sql).toContain("WHERE id = '42'");
  });

  it('generates INSERT statement for INSERT rows', () => {
    const sql = generateExportSql([insertRow], config);
    expect(sql).toContain("INSERT INTO schema2.employees");
    expect(sql).toContain("NAME, DEPT");
    expect(sql).toContain("'Bob', 'HR'");
  });

  it('skips IGNORED rows and adds a comment', () => {
    const ignoredRow: CompareJobDiffRow = { ...updateRow, status: 'IGNORED', pk: '7', pkMap: { id: '7' } };
    const sql = generateExportSql([ignoredRow], config);
    expect(sql).toContain('-- Skipped row: 7');
    expect(sql).not.toContain('UPDATE');
  });

  it('returns empty string for empty input', () => {
    expect(generateExportSql([], config)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/frontend
npm test -- exportSql
```

Expected: FAIL — `Cannot find module './exportSql'`.

- [ ] **Step 3: Implement exportSql.ts**

Create `frontend/src/services/exportSql.ts`:

```typescript
import type { CompareJobDiffRow, CompareJobRequest } from '../types/api';

function escapeValue(val: string): string {
  return val.replace(/'/g, "''");
}

export function generateExportSql(
  rows: CompareJobDiffRow[],
  config: CompareJobRequest
): string {
  const targetTable = config.tableTwo;

  const statements = rows.map((row) => {
    if (row.status === 'UPDATE') {
      const setClause = row.changes
        .map((c) => `${c.column} = '${escapeValue(c.sourceValue)}'`)
        .join(', ');
      const whereClause = Object.entries(row.pkMap)
        .map(([col, val]) => `${col} = '${escapeValue(val)}'`)
        .join(' AND ');
      return `UPDATE ${targetTable} SET ${setClause} WHERE ${whereClause};`;
    }

    if (row.status === 'INSERT') {
      const cols = row.changes.map((c) => c.column).join(', ');
      const vals = row.changes.map((c) => `'${escapeValue(c.sourceValue)}'`).join(', ');
      return `INSERT INTO ${targetTable} (${cols}) VALUES (${vals});`;
    }

    if (row.status === 'DELETE') {
      const whereClause = Object.entries(row.pkMap)
        .map(([col, val]) => `${col} = '${escapeValue(val)}'`)
        .join(' AND ');
      return `DELETE FROM ${targetTable} WHERE ${whereClause};`;
    }

    return `-- Skipped row: ${row.pk} (status: ${row.status})`;
  });

  return statements.join('\n');
}

export function downloadSqlFile(sql: string, filename = 'export.sql'): void {
  const blob = new Blob([sql], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/frontend
npm test -- exportSql
```

Expected: PASS (all 4 test cases green).

- [ ] **Step 5: Add `onExportSql` prop to DiffResult**

In `frontend/src/components/DiffResult.tsx`, add `onExportSql` to the interface and destructuring:

```typescript
interface DiffResultProps {
  data: CompareJobDiffRow[];
  onOpenSqlReview: (row: CompareJobDiffRow, column: string) => void;
  onReviewSelected?: (row: CompareJobDiffRow, column: string) => void;
  onBulkApproveSelected?: (selectedRows: CompareJobDiffRow[]) => void;
  onRowApprove?: (row: CompareJobDiffRow) => void;
  onRowReject?: (row: CompareJobDiffRow) => void;
  onExportSql?: () => void;
}
```

Wire the Export SQL button (find `<Button variant="outline">Export SQL</Button>` around line 155):

```tsx
<Button variant="outline" onClick={() => onExportSql?.()}>Export SQL</Button>
```

- [ ] **Step 6: Add `currentCompareConfig` state and `handleExportSql` to App.tsx**

In `frontend/src/App.tsx`, add state for the current compare config alongside `compareData`:

```typescript
const [currentCompareConfig, setCurrentCompareConfig] = useState<CompareJobRequest | null>(null);
```

In `handleRunComparison`, save the config before the API call:

```typescript
const handleRunComparison = async (config: CompareJobRequest) => {
  setLoading(true);
  setCurrentCompareConfig(config);   // add this line
  try {
    const response = await apiClient.compareJob(config);
    setCompareData(response.differences);
  } catch (error: any) {
    message.error(`Compare failed: ${error.response?.data?.error || error.message}`);
  } finally {
    setLoading(false);
  }
};
```

Add `handleExportSql` after `handleRunComparison`:

```typescript
const handleExportSql = () => {
  if (!currentCompareConfig || compareData.length === 0) {
    message.warning('No comparison data to export');
    return;
  }
  const { generateExportSql, downloadSqlFile } = await import('./services/exportSql');
  const sql = generateExportSql(compareData, currentCompareConfig);
  downloadSqlFile(sql, `export-${Date.now()}.sql`);
};
```

Wait — dynamic import inside a non-async function won't work. Use a static import at the top of App.tsx instead. Add to the import block at the top of `App.tsx`:

```typescript
import { generateExportSql, downloadSqlFile } from './services/exportSql';
```

Then `handleExportSql` becomes:

```typescript
const handleExportSql = () => {
  if (!currentCompareConfig || compareData.length === 0) {
    message.warning('No comparison data to export');
    return;
  }
  const sql = generateExportSql(compareData, currentCompareConfig);
  downloadSqlFile(sql, `export-${Date.now()}.sql`);
};
```

- [ ] **Step 7: Pass `onExportSql` to DiffResult in App.tsx**

Update the `<DiffResult ...>` JSX:

```tsx
<DiffResult
  data={compareData}
  onOpenSqlReview={handleOpenSqlReview}
  onReviewSelected={handleReviewSelected}
  onBulkApproveSelected={handleBulkApproveSelected}
  onRowApprove={handleRowApprove}
  onRowReject={handleRowReject}
  onExportSql={handleExportSql}
/>
```

- [ ] **Step 8: Run all frontend tests**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/frontend
npm test
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX
git add frontend/src/services/exportSql.ts \
        frontend/src/services/exportSql.test.ts \
        frontend/src/components/DiffResult.tsx \
        frontend/src/App.tsx
git commit -m "feat: implement Export SQL download for compare diff results"
```

---

## Task 7: Add SyncHistory to navigation

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

**Context:** The `SyncHistory` component is imported in App.tsx but never rendered — there is no `case 'history'` in `renderContent()` and no sidebar nav item pointing to it. The `Page` type already includes `'history'`. Simply add the nav item and the render case. The SyncHistory component itself remains as-is (mock data, buttons without handlers are acceptable for this phase).

- [ ] **Step 1: Add "Sync History" to Sidebar menu**

In `frontend/src/components/Sidebar.tsx`, find the `menuItems` array and add a new section or item. Add `History` to the imports at the top (it's already imported from lucide-react — confirm `History` is in the import). Add the item under "Database Sync":

```typescript
const menuItems = [
  {
    title: 'Patch Management',
    items: [
      { id: 'patches', label: 'Patches', icon: FileText },
    ]
  },
  {
    title: 'Database Sync',
    items: [
      { id: 'compare', label: 'Compare Job', icon: GitCompare },
      { id: 'history', label: 'Sync History', icon: History },
    ]
  }
];
```

- [ ] **Step 2: Add `case 'history'` to `renderContent()` in App.tsx**

In `frontend/src/App.tsx`, find `renderContent()` and add before `default`:

```typescript
case 'history':
  return <SyncHistory />;
```

- [ ] **Step 3: Run frontend tests**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX/frontend
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/ryanlin/Documents/CodeBase/AuditPatchX
git add frontend/src/components/Sidebar.tsx \
        frontend/src/App.tsx
git commit -m "fix: add SyncHistory to sidebar navigation and renderContent switch"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Bulk approve shows toast but no persistence → Tasks 4+5 add backend endpoint and wire API
- [x] Per-row Approve/Reject dead buttons → Task 3 wires with onClick; Task 5 adds API call
- [x] Export SQL dead → Task 6 implements and wires
- [x] INSERT rows expand to nothing → Task 1 populates changes for INSERT rows
- [x] Single-row selection approve blocked → Task 2 fixes canBulkApprove
- [x] SyncHistory not rendered → Task 7 adds nav + case
- [x] SqlReviewPanel submit not persisted → Task 5 updates handleSubmitSqlReview
- [x] `pkMap` needed for safe SQL generation → Task 1 adds to backend model, Task 5 adds to frontend type

**Placeholder scan:** No TBD or "add error handling" vague steps found. All code blocks are complete.

**Type consistency:**
- `CompareJobDiffRow.pkMap` added in Task 1 (backend), Task 5 (frontend type) — consistent
- `CompareReviewRequest` added in Task 4 (backend), Task 5 (frontend type) — consistent
- `onRowApprove`, `onRowReject` added in Task 3 (DiffResult props + App.tsx handlers) — consistent
- `onExportSql` added in Task 6 (DiffResult prop + App.tsx handler) — consistent
- `generateExportSql`, `downloadSqlFile` defined in Task 6 `exportSql.ts`, imported in App.tsx — consistent
