# AuditPatchX

**AuditPatchX** (also known as ConfigPatch) is a Git-like diff + confirm + update tool for Oracle database tables, designed for controlled configuration and critical data changes.

## Overview

AuditPatchX provides a secure, user-friendly interface for making controlled changes to database records with:

- **Git-like diff view** (side-by-side, unified, summary modes)
- **Field-level patch updates** (only changed fields are updated)
- **SQL injection protection** via metadata validation
- **Audit logging** of all changes with reasons
- **Allowlist-based access control** (only configured tables are accessible)

## Architecture

This is a monorepo containing:

- **`/backend`** - Kotlin + Quarkus + JDBI REST API
- **`/frontend`** - React + TypeScript + Tailwind CSS + Ant Design UI

## Features

### Backend Features

- Generic table access (no per-table models required)
- Security: SQL injection prevention via DatabaseMetaData validation
- Allowlist configuration for table access control
- REST APIs for query, get by PK, validate patch, and update
- Audit logging with timestamps and reasons
- Support for composite primary keys

### Frontend Features

- Table selection and PK-based querying
- Data grid with results display
- Side-by-side diff view (Before/After comparison)
- Live editing of proposed changes
- Approve/Reject workflow with mandatory reason field
- Git-style unified and summary diff modes

## Setup Instructions

### Prerequisites

- **Backend:**
  - Java 17 or higher
  - Maven 3.8+
  - Oracle Database (or compatible)

- **Frontend:**
  - Node.js 18+ and npm/yarn

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a `.env` file (copy from `.env.example`):
   ```bash
   cp ../.env.example .env
   ```

3. Configure your `.env` file:
   ```properties
   DB_URL=jdbc:oracle:thin:@localhost:1521:ORCL
   DB_USER=your_username
   DB_PASSWORD=your_password
   PORT=8080
   ```

4. Configure allowed tables in `src/main/resources/application.yml`:
   ```yaml
   allowlist:
     tables:
       - schema: HR
         table: EMPLOYEE
         pkColumns:
           - EMP_ID
       - schema: HR
         table: DEPARTMENT
         pkColumns:
           - DEPT_ID
   ```

5. Run in development mode:
   ```bash
   mvn quarkus:dev
   ```

6. Build for production:
   ```bash
   mvn clean package
   java -jar target/quarkus-app/quarkus-run.jar
   ```

The backend will start on `http://localhost:8080`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   npm run preview
   ```

The frontend will start on `http://localhost:3000`

## API Documentation

### Endpoints

#### 1. List Allowed Tables
```
GET /api/tables
```
**Response:**
```json
[
  {
    "schema": "HR",
    "table": "EMPLOYEE",
    "pkColumns": ["EMP_ID"]
  }
]
```

#### 2. Query by PK
```
POST /api/tables/get
```
**Request:**
```json
{
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": 10045 }
}
```

#### 3. Validate Patch
```
POST /api/tables/validate-patch
```
**Request:**
```json
{
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": 10045 },
  "set": { "EMAIL": "new@example.com" }
}
```

#### 4. Apply Update
```
POST /api/tables/update
```
**Request:**
```json
{
  "schema": "HR",
  "table": "EMPLOYEE",
  "pk": { "EMP_ID": 10045 },
  "set": { "EMAIL": "new@example.com" },
  "reason": "Correcting employee email"
}
```

#### 5. Get Table Metadata
```
GET /api/tables/{schema}/{table}/metadata
```

## Security

### SQL Injection Prevention

AuditPatchX implements comprehensive SQL injection prevention:

1. **Never trust schema/table/column names from API requests**
2. **Validate schema + table against allowlist** before any database operation
3. **Fetch column metadata from Oracle** using `DatabaseMetaData`
4. **Build validated map of allowed columns** for each table
5. **Reject requests** containing:
   - Columns not in metadata
   - PK columns in the `set` object
   - Invalid filter operators
6. **All SQL values use JDBI named parameters** (never concatenated)
7. **Schema/table/column identifiers** only appear in SQL after validation

### Access Control

- Only tables explicitly listed in `allowlist.tables` configuration are accessible
- PK columns must match the configured `pkColumns` for each table
- Update operations cannot modify PK columns

## Configuration

### Adding Allowed Tables

Edit `backend/src/main/resources/application.yml`:

```yaml
allowlist:
  tables:
    - schema: YOUR_SCHEMA
      table: YOUR_TABLE
      pkColumns:
        - PRIMARY_KEY_COLUMN_1
        - PRIMARY_KEY_COLUMN_2  # For composite PKs
```

### Database Connection

Configure via environment variables or `.env` file:

- `DB_URL` - JDBC connection string
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `PORT` - Backend server port (default: 8080)

## Usage Workflow

1. **Select a table** from the allowlist dropdown
2. **Enter PK values** for the record you want to edit
3. **Click FETCH** to load the record
4. **Review the record** in the data grid
5. **Click row** to load into diff view
6. **Edit proposed values** using the "Edit Proposed" button
7. **Review changes** in side-by-side, unified, or summary diff mode
8. **Click "Approve Change"** and provide a reason
9. **Confirm** to apply the update

## Development

### Backend Development

```bash
cd backend
mvn quarkus:dev
```

Hot reload is enabled - changes to Kotlin files will automatically reload.

### Frontend Development

```bash
cd frontend
npm run dev
```

Hot reload is enabled via Vite.

### Building

**Backend:**
```bash
cd backend
mvn clean package
```

**Frontend:**
```bash
cd frontend
npm run build
```

## Logging

All updates are logged with:
- Schema and table name
- Primary key values
- Changed columns
- Timestamp
- Reason provided by user

Logs are written to the console and can be configured via `application.yml`.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues or questions, please open an issue on the project repository.
