# AuditPatchX Backend Tests

Comprehensive test suite for the AuditPatchX backend using Oracle DB with Test Containers.

## Overview

This test suite provides comprehensive coverage for all API endpoints and services using:
- **Test Containers**: Oracle XE database in Docker container
- **JUnit 5**: Testing framework
- **REST Assured**: API endpoint testing
- **AssertJ**: Fluent assertions

## Test Structure

```
src/test/
├── kotlin/com/auditpatchx/
│   ├── OracleTestResource.kt                 # Oracle DB container lifecycle management
│   ├── service/
│   │   ├── DatabaseServiceTest.kt            # Database operations tests
│   │   └── SecurityValidationServiceTest.kt  # Security validation tests
│   └── resource/
│       └── TableResourceTest.kt              # API endpoint integration tests
└── resources/
    ├── application.yml                        # Test configuration
    └── test-schema.sql                        # Test database schema and data
```

## Test Coverage

### 1. DatabaseServiceTest
Tests all database operations with Oracle DB:

**Query Tests:**
- Query all records
- Query with equality filters
- Query with contains/startsWith filters
- Query with comparison operators (gt, gte, lt, lte)
- Query with multiple filters
- Limit enforcement and validation
- Invalid operator handling
- Unauthorized table access

**GetByPk Tests:**
- Get by single primary key
- Get by composite primary key
- Handle non-existent records (404)
- Invalid PK column validation

**ValidatePatch Tests:**
- Validate valid patch requests
- Reject invalid columns
- Prevent PK modification attempts

**Update Tests:**
- Update single field
- Update multiple fields
- Prevent PK updates
- Invalid column validation
- Transaction handling

**GetTableMetadata Tests:**
- Retrieve table metadata
- Composite PK handling
- Column type and nullability information
- Unauthorized table access

### 2. SecurityValidationServiceTest
Tests all security validation logic:

**ValidateAndGetColumns Tests:**
- Allowlist validation
- Column metadata caching
- Non-existent table handling
- Case-insensitive validation
- Schema isolation

**ValidateColumns Tests:**
- Valid column acceptance
- Invalid column rejection
- Case-insensitive matching
- Empty column list handling
- Mixed valid/invalid columns

**ValidatePkColumns Tests:**
- Single PK validation
- Composite PK validation
- Incomplete PK detection
- Extra PK column detection
- Case-insensitive PK validation

**ValidateSetColumnsNotPk Tests:**
- Non-PK column updates
- PK update prevention
- Composite PK protection
- Case-insensitive PK checks

**GetDetailedColumnMetadata Tests:**
- Column metadata retrieval
- Type information
- Nullability detection
- Multiple table support

**Cache Tests:**
- Metadata caching
- Cache clearing

### 3. TableResourceTest
Integration tests for all API endpoints:

**GET /api/tables:**
- List all allowed tables
- Verify table configurations

**POST /api/tables/query:**
- Query without filters
- Query with various filter operators
- Multiple filter combinations
- Limit enforcement
- Error handling (403, 500)

**POST /api/tables/record/get:**
- Get by single PK
- Get by composite PK
- 404 for non-existent records
- 403 for invalid PK columns

**POST /api/tables/record/validate-patch:**
- Validate valid patches
- Reject invalid columns
- Prevent PK modifications

**POST /api/tables/record/update:**
- Update single/multiple fields
- Require reason field
- Prevent PK updates
- Invalid column handling
- Return updated record

**GET /api/tables/db/tables/{schema}/{table}:**
- Retrieve table metadata
- Composite PK information
- Column details (name, type, nullable)
- Unauthorized table access

## Test Data

The test database includes three tables:

### TESTUSER.EMPLOYEE
- 5 employees across 3 departments
- Fields: EMP_ID (PK), FIRST_NAME, LAST_NAME, EMAIL, PHONE, HIRE_DATE, SALARY, DEPT_ID, MANAGER_ID

### TESTUSER.DEPARTMENT
- 3 departments (Engineering, Sales, HR)
- Fields: DEPT_ID (PK), DEPT_NAME, LOCATION, BUDGET

### TESTUSER.JOB_HISTORY
- 3 job history records
- Fields: EMPLOYEE_ID (PK), START_DATE (PK), END_DATE, JOB_TITLE, DEPARTMENT_ID

## Running Tests

### Prerequisites
- JDK 17+
- Maven 3.8+
- Docker (for Test Containers)

### Run All Tests
```bash
cd backend
mvn clean test
```

### Run Specific Test Class
```bash
mvn test -Dtest=DatabaseServiceTest
mvn test -Dtest=SecurityValidationServiceTest
mvn test -Dtest=TableResourceTest
```

### Run Specific Test Method
```bash
mvn test -Dtest=DatabaseServiceTest#testQueryAllEmployees
```

## Test Configuration

Test configuration is in `src/test/resources/application.yml`:
- Uses Oracle XE container (gvenzl/oracle-xe:21-slim-faststart)
- Test schema: TESTUSER
- Test user: test/test
- Random test port to avoid conflicts

## Key Features

1. **Isolated Test Environment**: Each test run uses a fresh Oracle container
2. **Comprehensive Coverage**: All API endpoints and service methods tested
3. **Security Testing**: Validates all security constraints and allowlist rules
4. **Error Scenarios**: Tests both success and failure cases
5. **Real Database**: Uses actual Oracle DB, not mocks
6. **Fast Startup**: Uses gvenzl/oracle-xe:21-slim-faststart for quick container startup
7. **Data Initialization**: Automatic schema and test data setup

## Dependencies

Added to `pom.xml`:
```xml
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>testcontainers</artifactId>
    <version>1.19.3</version>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>oracle-xe</artifactId>
    <version>1.19.3</version>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>1.19.3</version>
</dependency>
<dependency>
    <groupId>io.rest-assured</groupId>
    <artifactId>rest-assured</artifactId>
</dependency>
<dependency>
    <groupId>org.assertj</groupId>
    <artifactId>assertj-core</artifactId>
    <version>3.25.1</version>
</dependency>
```

## Test Results

All tests validate:
- ✅ Correct functionality for valid inputs
- ✅ Proper error handling and HTTP status codes
- ✅ Security constraints (allowlist, PK protection, SQL injection prevention)
- ✅ Data integrity and transactions
- ✅ Case-insensitive operations
- ✅ Composite primary key support

## Notes

- Tests use AssertJ for readable assertions
- REST Assured provides fluent API testing syntax
- Oracle container is shared across test classes for performance
- Database state is reset between test methods where needed
- All SQL operations use parameterized queries (no SQL injection risk)
