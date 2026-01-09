
## System Design Prompt Update: Field-level Patch Update (Correct)

### Key requirement

Updates must be done **by changed fields**, not by sending the whole record content.

* Frontend edits an “After / Proposed” state.
* On approve, frontend sends:

  * **PK object**
  * **set object containing only changed fields**
  * **reason** (required)
* Backend updates only the specified fields for that PK.

---

## API design (Patch-based)

### 1) Get table metadata (drives UI + diff rules)

`GET /api/db/{env}/tables/{schema}/{table}`

Response must include:

* `pkColumns: string[]`
* `columns: [{ name, type, nullable }]`
* `readonlyColumns: string[]` (timestamps/audit)
* `diffPolicy`:

  * `excludeTypes: string[]` (TIMESTAMP, DATE, NUMBER…)
  * `excludeColumns: string[]`
  * optional `includeColumns: string[]`

---

### 2) PK query (default returns PK columns only)

`POST /api/query/pk`

Request:

```json
{
  "env": "prod",
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": "10045", "ORG_ID": "GLOBAL" },
  "limit": 50
}
```

Response:

```json
{
  "columns": ["EMP_ID", "ORG_ID"],
  "rows": [{ "EMP_ID": "10045", "ORG_ID": "GLOBAL" }]
}
```

---

### 3) Get row by PK (full row for baseline + editing)

`POST /api/record/get`

Request:

```json
{
  "env": "prod",
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": "10045", "ORG_ID": "GLOBAL" }
}
```

Response:

```json
{
  "row": { "...full record..." }
}
```

---

### 4) Validate patch (recommended)

Validates PK + columns + readonly rules + type safety before applying.

`POST /api/record/validate-patch`

Request:

```json
{
  "env": "prod",
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": "10045", "ORG_ID": "GLOBAL" },
  "set": { "EMAIL": "nancy_updated@example.com" }
}
```

Response:

```json
{
  "ok": true,
  "normalizedSet": { "EMAIL": "nancy_updated@example.com" },
  "rejectedFields": [],
  "warnings": []
}
```

Rules:

* Reject if `set` contains:

  * PK columns
  * readonly columns
  * columns not present in metadata
* Normalize/convert obvious types if safe (optional)

---

### 5) Apply patch (main update)

`POST /api/record/update`

Request:

```json
{
  "env": "prod",
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": "10045", "ORG_ID": "GLOBAL" },
  "set": { "EMAIL": "nancy_updated@example.com" },
  "reason": "Correct email"
}
```

Response:

```json
{
  "updated": 1,
  "row": { "...fresh record after update..." }
}
```

Backend requirements:

* SQL safety:

  * values bound with JDBI named params
  * schema/table allowlisted
  * columns validated via DB metadata map
* Only update columns present in `set`
* Transaction + log/audit record

---

## Diff rules (not all fields need diff)

Frontend diff UI must focus on meaningful fields:

* Default diff-visible:

  * text/varchar/clob/json/enum-like
* Default diff-hidden/collapsed:

  * timestamp/date
  * numeric types (int/double/number)
* These rules come from backend metadata (`diffPolicy`) so behavior is consistent per table.

---

## UI workflow (matches your demo)

1. User inputs PK in toolbar → **FETCH**
2. Grid shows PK-only results by default
3. Selecting a row loads full record into diff workspace
4. User edits proposed fields
5. Diff panel updates live (side-by-side/unified/summary)
6. Approve → send **pk + set(changed fields only) + reason** to backend
7. Backend updates, returns fresh row, UI refreshes grid + diff baseline
