Here’s a **full repo prompt** you can paste into ChatGPT / a code generator to produce the whole project. I’ll assume the project name is **ConfigPatch** (you can swap it back to AuditPatch anytime).

---

## Full Repo Prompt (ConfigPatch)

Create a monorepo named **ConfigPatch** (or AuditPatch) with this folder structure:

```
/frontend
/backend
README.md
```

This project is a **Git-like diff + confirm + update tool** for **Oracle tables**, designed for **controlled configuration/critical data changes**.

---

# 1) Backend requirements (`/backend`)

## Tech

* **Kotlin + Quarkus**
* **Maven** build
* **JDBI** for DB access
* Oracle database (default)
* Config via **.env + Quarkus placeholders**
* Expose REST APIs (JSON)

## Core behavior

Backend is **generic** (no per-table data models). It supports only:

* `SELECT` (query/search)
* `SELECT` by PK (get row for baseline)
* `UPDATE` by PK (apply confirmed changes)

## Table allowlist config (backend-only)

Backend must load an allowlist configuration, each item contains:

* `schema` (required)
* `tableName` (required)
* `pkColumns` (required, supports composite PK)

Only allowlisted tables are accessible.

## Critical security requirement: prevent SQL injection via identifiers

API requests include column names (filters / PK / set). Backend must prevent identifier injection:

1. **Never trust schema/table/column from API**
2. Validate `schema + table` against allowlist first
3. Fetch column metadata from Oracle for that table (via `DatabaseMetaData` or `ALL_TAB_COLUMNS`)
4. Build a validated map/set of columns: `allowedColumns = { COL_NAME -> true }`
5. Reject any request if:

   * filter column not in allowedColumns
   * set column not in allowedColumns
   * pk key not matching configured pkColumns
6. SQL values must always use **JDBI named parameters** (no value concatenation).
7. Schema/table/column identifiers can only appear in SQL after passing allowlist + metadata validation.

## APIs

Implement these endpoints:

### 1) List allowed tables

`GET /api/tables`
Response example:

```json
[
  { "schema": "HR", "table": "EMPLOYEE", "pkColumns": ["EMP_ID"] }
]
```

### 2) Query

`POST /api/tables/query`
Request:

```json
{
  "schema": "HR",
  "table": "EMPLOYEE",
  "filters": [
    { "col": "EMPLOYEE_NAME", "op": "contains", "value": "Tom" },
    { "col": "STATUS", "op": "eq", "value": "ACTIVE" }
  ],
  "limit": 50
}
```

Constraints:

* Enforce `limit <= 200`
* Allowed operators only: `eq`, `contains`, `startsWith`, `gt`, `gte`, `lt`, `lte`
* Return:

```json
{ "columns": [...], "rows": [ {...}, {...} ] }
```

### 3) Get by PK

`POST /api/tables/get`
Request:

```json
{
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": 1 }
}
```

Response:

```json
{ "row": { ... } }
```

### 4) Update by PK

`POST /api/tables/update`
Request:

```json
{
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": 1 },
  "set": { "STATUS": "INACTIVE", "COMMENT": "manual update" }
}
```

Constraints:

* Only update columns in `set`
* SQL pattern:

  * `UPDATE <schema>.<table> SET col=:col ... WHERE pk=:pk ...`
* All values bound via JDBI named params
* Return:

```json
{ "updated": 1, "row": { ...fresh row... } }
```

## Logging

On every update:

* log schema.table
* pk
* changed columns
* timestamp
* (actor if available; auth optional)

## .env and config

Add `.env.example` at repo root or backend folder with:

* `DB_URL`
* `DB_USER`
* `DB_PASSWORD`
* optional `PORT`

Quarkus config must use placeholders:

* `quarkus.datasource.jdbc.url=${DB_URL}`
* `quarkus.datasource.username=${DB_USER}`
* `quarkus.datasource.password=${DB_PASSWORD}`

`.env` must be in `.gitignore`.

## Maven spec

Provide a working `pom.xml` for Quarkus + Kotlin + JDBI + Oracle JDBC.
Include dev mode and build instructions:

* `mvn quarkus:dev`
* `mvn clean package`

---

# 2) Frontend requirements (`/frontend`)

## Tech

* **React + TypeScript**
* **Tailwind CSS** for layout/styling
* **Ant Design** for UI components
* Use `fetch` or `axios` for API calls

## Core UI flow

1. Table selection

* Fetch allowed tables from `GET /api/tables`
* User selects schema/table

2. Query & display

* Filter form (AntD Form)
* Results table (AntD Table)
* Show returned columns dynamically

3. Edit

* Row click opens an **Edit Drawer** (AntD Drawer)
* On open, call `/api/tables/get` to fetch baseline row by PK
* Render a dynamic form for the row fields (simple generic edit)

4. Diff preview (Git-like)

* Before update, user must click **Preview Diff**
* Show a **Diff Modal / Panel** that compares:

  * baseline row (from backend)
  * edited row (current state)
* Requirements:

  * show changed fields list
  * for long text fields, show a git-like text diff (unified or side-by-side)
  * confirm / cancel buttons

5. Confirm update

* Only after confirm, call `/api/tables/update` with `{ pk, set }`
* Show success notification (AntD message)
* Refresh table results

## Diff implementation guidance

* Compute diff on frontend.
* Use a text diff library for long strings (git-like rendering).
* For normal values, display `old -> new` clearly.

## UX constraints

* Keep it simple and clean: one main page, drawer for edit, modal for diff.
* Handle loading and API errors.

---

# 3) Repo deliverables

* `/backend` Quarkus Kotlin Maven project, runnable with `.env`
* `/frontend` React TS project with Tailwind + AntD
* Root `README.md` including:

  * setup steps (frontend/backend)
  * `.env.example` usage
  * how to add allowlisted tables
  * API contract examples
  * security rules (metadata validation, no injection)

---

If you want, I can also generate:

* a **recommended `README.md` content** (copy-paste ready),
* the **allowlist config format** (YAML vs application.properties),
* and a suggested naming convention for PK detection on the frontend (so it can build `/get` and `/update` requests cleanly).
