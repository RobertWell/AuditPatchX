-- Test schema initialization for Oracle DB
-- This script creates test tables and populates them with sample data

-- Create TESTUSER schema tables
CREATE TABLE TESTUSER.DEPARTMENT (
    DEPT_ID NUMBER(10) PRIMARY KEY,
    DEPT_NAME VARCHAR2(100) NOT NULL,
    LOCATION VARCHAR2(100),
    BUDGET NUMBER(15,2)
);

CREATE TABLE TESTUSER.EMPLOYEE (
    EMP_ID NUMBER(10) PRIMARY KEY,
    FIRST_NAME VARCHAR2(50) NOT NULL,
    LAST_NAME VARCHAR2(50) NOT NULL,
    EMAIL VARCHAR2(100),
    PHONE VARCHAR2(20),
    HIRE_DATE DATE NOT NULL,
    SALARY NUMBER(10,2),
    BIO CLOB,
    DEPT_ID NUMBER(10),
    MANAGER_ID NUMBER(10),
    CONSTRAINT fk_emp_dept FOREIGN KEY (DEPT_ID) REFERENCES TESTUSER.DEPARTMENT(DEPT_ID)
);

CREATE TABLE TESTUSER.JOB_HISTORY (
    EMPLOYEE_ID NUMBER(10),
    START_DATE DATE,
    END_DATE DATE,
    JOB_TITLE VARCHAR2(100) NOT NULL,
    DEPARTMENT_ID NUMBER(10),
    CONSTRAINT pk_job_history PRIMARY KEY (EMPLOYEE_ID, START_DATE),
    CONSTRAINT fk_jobhist_emp FOREIGN KEY (EMPLOYEE_ID) REFERENCES TESTUSER.EMPLOYEE(EMP_ID),
    CONSTRAINT fk_jobhist_dept FOREIGN KEY (DEPARTMENT_ID) REFERENCES TESTUSER.DEPARTMENT(DEPT_ID)
);

CREATE TABLE TESTUSER.COMPARE_SOURCE (
    ID NUMBER(10) PRIMARY KEY,
    STATUS VARCHAR2(30),
    UPDATED_BY VARCHAR2(50),
    DESCRIPTION CLOB
);

CREATE TABLE TESTUSER.COMPARE_TARGET (
    ID NUMBER(10) PRIMARY KEY,
    STATUS VARCHAR2(30),
    UPDATED_BY VARCHAR2(50),
    DESCRIPTION CLOB
);

-- Insert test data for DEPARTMENT
INSERT INTO TESTUSER.DEPARTMENT (DEPT_ID, DEPT_NAME, LOCATION, BUDGET)
VALUES (1, 'Engineering', 'San Francisco', 1000000.00);

INSERT INTO TESTUSER.DEPARTMENT (DEPT_ID, DEPT_NAME, LOCATION, BUDGET)
VALUES (2, 'Sales', 'New York', 750000.00);

INSERT INTO TESTUSER.DEPARTMENT (DEPT_ID, DEPT_NAME, LOCATION, BUDGET)
VALUES (3, 'HR', 'Chicago', 500000.00);

-- Insert test data for EMPLOYEE
INSERT INTO TESTUSER.EMPLOYEE (EMP_ID, FIRST_NAME, LAST_NAME, EMAIL, PHONE, HIRE_DATE, SALARY, DEPT_ID, MANAGER_ID)
VALUES (1, 'John', 'Doe', 'john.doe@example.com', '555-0101', TO_DATE('2020-01-15', 'YYYY-MM-DD'), 85000.00, 1, NULL);

INSERT INTO TESTUSER.EMPLOYEE (EMP_ID, FIRST_NAME, LAST_NAME, EMAIL, PHONE, HIRE_DATE, SALARY, DEPT_ID, MANAGER_ID)
VALUES (2, 'Jane', 'Smith', 'jane.smith@example.com', '555-0102', TO_DATE('2020-03-20', 'YYYY-MM-DD'), 75000.00, 1, 1);

INSERT INTO TESTUSER.EMPLOYEE (EMP_ID, FIRST_NAME, LAST_NAME, EMAIL, PHONE, HIRE_DATE, SALARY, DEPT_ID, MANAGER_ID)
VALUES (3, 'Bob', 'Johnson', 'bob.johnson@example.com', '555-0103', TO_DATE('2021-06-10', 'YYYY-MM-DD'), 65000.00, 2, 1);

INSERT INTO TESTUSER.EMPLOYEE (EMP_ID, FIRST_NAME, LAST_NAME, EMAIL, PHONE, HIRE_DATE, SALARY, DEPT_ID, MANAGER_ID)
VALUES (4, 'Alice', 'Williams', 'alice.williams@example.com', '555-0104', TO_DATE('2021-09-01', 'YYYY-MM-DD'), 70000.00, 3, 1);

INSERT INTO TESTUSER.EMPLOYEE (EMP_ID, FIRST_NAME, LAST_NAME, EMAIL, PHONE, HIRE_DATE, SALARY, DEPT_ID, MANAGER_ID)
VALUES (5, 'Charlie', 'Brown', 'charlie.brown@example.com', '555-0105', TO_DATE('2022-01-15', 'YYYY-MM-DD'), 60000.00, 2, 3);

-- Insert test data for JOB_HISTORY
INSERT INTO TESTUSER.JOB_HISTORY (EMPLOYEE_ID, START_DATE, END_DATE, JOB_TITLE, DEPARTMENT_ID)
VALUES (2, TO_DATE('2020-03-20', 'YYYY-MM-DD'), TO_DATE('2021-03-20', 'YYYY-MM-DD'), 'Junior Developer', 1);

INSERT INTO TESTUSER.JOB_HISTORY (EMPLOYEE_ID, START_DATE, END_DATE, JOB_TITLE, DEPARTMENT_ID)
VALUES (2, TO_DATE('2021-03-21', 'YYYY-MM-DD'), NULL, 'Senior Developer', 1);

INSERT INTO TESTUSER.JOB_HISTORY (EMPLOYEE_ID, START_DATE, END_DATE, JOB_TITLE, DEPARTMENT_ID)
VALUES (3, TO_DATE('2021-06-10', 'YYYY-MM-DD'), NULL, 'Sales Representative', 2);

-- Insert test data for compare workflow
INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (
    1,
    'APPROVED',
    'SOURCE_USER',
    'source long text payload ' || RPAD('x', 150, 'x')
);

INSERT INTO TESTUSER.COMPARE_TARGET (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (
    1,
    'PENDING',
    'TARGET_USER',
    'target long text payload ' || RPAD('y', 150, 'y')
);

INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (2, 'MATCHED', 'SOURCE_USER', 'same text');

INSERT INTO TESTUSER.COMPARE_TARGET (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (2, 'MATCHED', 'TARGET_USER', 'same text');

INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (3, 'NEW', 'SOURCE_USER', 'source-only row');

-- HEL-27 regression matrix -------------------------------------------------
-- PK 4: CLOB content identical except line endings (LF vs CRLF) -> NO diff
INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (4, 'MATCHED', 'SOURCE_USER', 'line1' || CHR(10) || 'line2' || CHR(10) || 'line3');
INSERT INTO TESTUSER.COMPARE_TARGET (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (4, 'MATCHED', 'TARGET_USER', 'line1' || CHR(13) || CHR(10) || 'line2' || CHR(13) || CHR(10) || 'line3');

-- PK 5: REAL CLOB content difference -> exactly one UPDATE (DESCRIPTION)
INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (5, 'MATCHED', 'SOURCE_USER', 'real' || CHR(10) || 'difference-src');
INSERT INTO TESTUSER.COMPARE_TARGET (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (5, 'MATCHED', 'TARGET_USER', 'real' || CHR(13) || CHR(10) || 'difference-tgt');

-- PK 6: NON-CLOB (VARCHAR2 STATUS) differing only in line endings -> one UPDATE
-- (exact comparison must be preserved outside CLOB/NCLOB)
INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (6, 'A' || CHR(10) || 'B', 'SOURCE_USER', 'same clob');
INSERT INTO TESTUSER.COMPARE_TARGET (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (6, 'A' || CHR(13) || CHR(10) || 'B', 'TARGET_USER', 'same clob');

-- PK 7: NULL vs NULL CLOB -> equal, NO diff
INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (7, 'MATCHED', 'SOURCE_USER', NULL);
INSERT INTO TESTUSER.COMPARE_TARGET (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (7, 'MATCHED', 'TARGET_USER', NULL);

-- PK 8: NULL vs non-null CLOB -> one UPDATE
INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (8, 'MATCHED', 'SOURCE_USER', NULL);
INSERT INTO TESTUSER.COMPARE_TARGET (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (8, 'MATCHED', 'TARGET_USER', 'now populated');

-- PK 9: source-only row with multiline CLOB -> exactly one INSERT
INSERT INTO TESTUSER.COMPARE_SOURCE (ID, STATUS, UPDATED_BY, DESCRIPTION)
VALUES (9, 'NEW', 'SOURCE_USER', 'multi' || CHR(13) || CHR(10) || 'line' || CHR(10) || 'clob');

-- Comprehensive type tables for review approve integration tests
CREATE TABLE TESTUSER.ALLTYPE_SOURCE (
    ID          NUMBER(10)   PRIMARY KEY,
    INT_VAL     NUMBER(10),
    DEC_VAL     NUMBER(15,6),
    STR_VAL     VARCHAR2(200),
    DATE_VAL    DATE,
    TS_VAL      TIMESTAMP(6),
    CLOB_VAL    CLOB,
    NULL_VAL    VARCHAR2(100)
);

CREATE TABLE TESTUSER.ALLTYPE_TARGET (
    ID          NUMBER(10)   PRIMARY KEY,
    INT_VAL     NUMBER(10),
    DEC_VAL     NUMBER(15,6),
    STR_VAL     VARCHAR2(200),
    DATE_VAL    DATE,
    TS_VAL      TIMESTAMP(6),
    CLOB_VAL    CLOB,
    NULL_VAL    VARCHAR2(100)
);

-- Row 10: UPDATE — source has rich values, target has stale values
INSERT INTO TESTUSER.ALLTYPE_SOURCE (ID, INT_VAL, DEC_VAL, STR_VAL, DATE_VAL, TS_VAL, CLOB_VAL, NULL_VAL)
VALUES (10, 42, 123.456789, 'source text',
        TO_DATE('2023-06-15', 'YYYY-MM-DD'),
        TIMESTAMP '2023-06-15 10:30:00.123456',
        'short clob source', 'not null');

INSERT INTO TESTUSER.ALLTYPE_TARGET (ID, INT_VAL, DEC_VAL, STR_VAL, DATE_VAL, TS_VAL, CLOB_VAL, NULL_VAL)
VALUES (10, 1, 1.000000, 'old text',
        TO_DATE('2020-01-01', 'YYYY-MM-DD'),
        TIMESTAMP '2020-01-01 00:00:00.000000',
        'old clob', 'old null value');

-- Row 11: UPDATE NULL — source NULL_VAL is NULL, target has a value
INSERT INTO TESTUSER.ALLTYPE_SOURCE (ID, STR_VAL, NULL_VAL)
VALUES (11, 'source str', NULL);

INSERT INTO TESTUSER.ALLTYPE_TARGET (ID, STR_VAL, NULL_VAL)
VALUES (11, 'old str', 'has value');

-- Row 12: UPDATE large CLOB — CLOB_VAL will be replaced with >4000 chars in test setup
INSERT INTO TESTUSER.ALLTYPE_SOURCE (ID, CLOB_VAL)
VALUES (12, 'placeholder');

INSERT INTO TESTUSER.ALLTYPE_TARGET (ID, CLOB_VAL)
VALUES (12, 'old clob');

-- Row 20: INSERT — source only, no row in target (INT, STR, CLOB only)
INSERT INTO TESTUSER.ALLTYPE_SOURCE (ID, INT_VAL, STR_VAL, CLOB_VAL)
VALUES (20, 99, 'insert me', 'clob to insert');

-- Row 21: INSERT — all types fully populated
INSERT INTO TESTUSER.ALLTYPE_SOURCE (ID, INT_VAL, DEC_VAL, STR_VAL, DATE_VAL, TS_VAL, CLOB_VAL, NULL_VAL)
VALUES (21, 77, 999.123456, 'full insert row',
        TO_DATE('2024-03-01', 'YYYY-MM-DD'),
        TIMESTAMP '2024-03-01 09:00:00.654321',
        'clob for full insert', 'populated');

-- Row 22: INSERT — sparse row (most columns NULL, exercises NULL propagation into target)
INSERT INTO TESTUSER.ALLTYPE_SOURCE (ID, STR_VAL)
VALUES (22, 'sparse insert');

-- Row 23: INSERT — large CLOB placeholder (test sets the real value before approving)
INSERT INTO TESTUSER.ALLTYPE_SOURCE (ID, INT_VAL, CLOB_VAL)
VALUES (23, 5, 'large-clob-placeholder');

-- Composite PK tables (REGION_ID NUMBER + DEPT_CODE VARCHAR2)
CREATE TABLE TESTUSER.COMPOSITE_SOURCE (
    REGION_ID   NUMBER(10),
    DEPT_CODE   VARCHAR2(20),
    VALUE       VARCHAR2(200),
    AMOUNT      NUMBER(15,2),
    CONSTRAINT pk_composite_src PRIMARY KEY (REGION_ID, DEPT_CODE)
);

CREATE TABLE TESTUSER.COMPOSITE_TARGET (
    REGION_ID   NUMBER(10),
    DEPT_CODE   VARCHAR2(20),
    VALUE       VARCHAR2(200),
    AMOUNT      NUMBER(15,2),
    CONSTRAINT pk_composite_tgt PRIMARY KEY (REGION_ID, DEPT_CODE)
);

-- Row 1: UPDATE
INSERT INTO TESTUSER.COMPOSITE_SOURCE (REGION_ID, DEPT_CODE, VALUE, AMOUNT)
VALUES (1, 'EAST', 'source value', 100.50);
INSERT INTO TESTUSER.COMPOSITE_TARGET (REGION_ID, DEPT_CODE, VALUE, AMOUNT)
VALUES (1, 'EAST', 'old value', 50.00);

-- Row 2: INSERT (source only)
INSERT INTO TESTUSER.COMPOSITE_SOURCE (REGION_ID, DEPT_CODE, VALUE, AMOUNT)
VALUES (2, 'WEST', 'new row', 200.00);

-- Timestamp PK tables (EVENT_ID + EVENT_TS TIMESTAMP(6))
CREATE TABLE TESTUSER.TSPK_SOURCE (
    EVENT_ID    NUMBER(10),
    EVENT_TS    TIMESTAMP(6),
    PAYLOAD     VARCHAR2(200),
    CONSTRAINT pk_tspk_src PRIMARY KEY (EVENT_ID, EVENT_TS)
);

CREATE TABLE TESTUSER.TSPK_TARGET (
    EVENT_ID    NUMBER(10),
    EVENT_TS    TIMESTAMP(6),
    PAYLOAD     VARCHAR2(200),
    CONSTRAINT pk_tspk_tgt PRIMARY KEY (EVENT_ID, EVENT_TS)
);

-- Row 1: UPDATE
INSERT INTO TESTUSER.TSPK_SOURCE (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (1, TIMESTAMP '2023-06-15 10:30:00', 'source payload');
INSERT INTO TESTUSER.TSPK_TARGET (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (1, TIMESTAMP '2023-06-15 10:30:00', 'old payload');

-- Row 2: INSERT (source only)
INSERT INTO TESTUSER.TSPK_SOURCE (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (2, TIMESTAMP '2023-06-16 12:00:00', 'new event payload');

-- Timezone-aware PK tables (EVENT_ID + EVENT_TS TIMESTAMP WITH TIME ZONE)
-- Row 1 is at UTC+1, row 2 is the same local time at UTC+8 — different UTC instants,
-- so they are distinct PK values and test that timezone offset survives the approve flow.
CREATE TABLE TESTUSER.TZPK_SOURCE (
    EVENT_ID    NUMBER(10),
    EVENT_TS    TIMESTAMP(6) WITH TIME ZONE,
    PAYLOAD     VARCHAR2(200)
);

CREATE TABLE TESTUSER.TZPK_TARGET (
    EVENT_ID    NUMBER(10),
    EVENT_TS    TIMESTAMP(6) WITH TIME ZONE,
    PAYLOAD     VARCHAR2(200)
);

-- Row 1: UTC+1 timestamp, UPDATE
INSERT INTO TESTUSER.TZPK_SOURCE (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (1, TO_TIMESTAMP_TZ('2023-06-15 10:30:00 +01:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 'utc1 source payload');
INSERT INTO TESTUSER.TZPK_TARGET (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (1, TO_TIMESTAMP_TZ('2023-06-15 10:30:00 +01:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 'utc1 old payload');

-- Row 2: UTC+8 timestamp (same local time, different UTC instant), UPDATE
INSERT INTO TESTUSER.TZPK_SOURCE (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (2, TO_TIMESTAMP_TZ('2023-06-15 10:30:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 'utc8 source payload');
INSERT INTO TESTUSER.TZPK_TARGET (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (2, TO_TIMESTAMP_TZ('2023-06-15 10:30:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 'utc8 old payload');

-- Row 3: UTC+8, INSERT (source only)
INSERT INTO TESTUSER.TZPK_SOURCE (EVENT_ID, EVENT_TS, PAYLOAD)
VALUES (3, TO_TIMESTAMP_TZ('2023-06-16 08:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), 'utc8 insert payload');

COMMIT;

-- ============================================================
-- Direction-sensitivity tables
-- Used to verify A→B vs B→A produce different diffs and that
-- approval writes to the correct target in each direction.
-- ============================================================
CREATE TABLE TESTUSER.DIRECTION_A (
    ID    NUMBER(10) PRIMARY KEY,
    VALUE VARCHAR2(100)
);

CREATE TABLE TESTUSER.DIRECTION_B (
    ID    NUMBER(10) PRIMARY KEY,
    VALUE VARCHAR2(100)
);

-- ID 1: exists in BOTH with DIFFERENT values
--   A→B diff: sourceValue='a-val-1', targetValue='b-val-1'
--   B→A diff: sourceValue='b-val-1', targetValue='a-val-1'
INSERT INTO TESTUSER.DIRECTION_A VALUES (1, 'a-val-1');
INSERT INTO TESTUSER.DIRECTION_B VALUES (1, 'b-val-1');

-- ID 2: exists in BOTH with IDENTICAL values — must not appear in any diff
INSERT INTO TESTUSER.DIRECTION_A VALUES (2, 'same-value');
INSERT INTO TESTUSER.DIRECTION_B VALUES (2, 'same-value');

-- ID 10: only in A — A→B shows INSERT; B→A does NOT show this row
INSERT INTO TESTUSER.DIRECTION_A VALUES (10, 'a-only');

-- ID 20: only in B — B→A shows INSERT; A→B does NOT show this row
INSERT INTO TESTUSER.DIRECTION_B VALUES (20, 'b-only');

-- ID 30: both present, different — dedicated to A→B UPDATE approve test
INSERT INTO TESTUSER.DIRECTION_A VALUES (30, 'a-val-30');
INSERT INTO TESTUSER.DIRECTION_B VALUES (30, 'b-val-30');

-- ID 40: both present, different — dedicated to B→A UPDATE approve test
INSERT INTO TESTUSER.DIRECTION_A VALUES (40, 'a-val-40');
INSERT INTO TESTUSER.DIRECTION_B VALUES (40, 'b-val-40');

COMMIT;

-- ============================================================
-- Numeric composite PK tables
-- PK = (REGION_ID NUMBER(10), PRICE_SCALE NUMBER(15,6))
-- Tests that BigDecimal binding for NUMBER PK columns works
-- without ORA-01722 and without precision/scale loss.
-- ============================================================
CREATE TABLE TESTUSER.NUMPK_SOURCE (
    REGION_ID   NUMBER(10),
    PRICE_SCALE NUMBER(15,6),
    LABEL       VARCHAR2(200),
    CONSTRAINT pk_numpk_src PRIMARY KEY (REGION_ID, PRICE_SCALE)
);

CREATE TABLE TESTUSER.NUMPK_TARGET (
    REGION_ID   NUMBER(10),
    PRICE_SCALE NUMBER(15,6),
    LABEL       VARCHAR2(200),
    CONSTRAINT pk_numpk_tgt PRIMARY KEY (REGION_ID, PRICE_SCALE)
);

-- Row (1, 100.5): UPDATE — same PK in both, LABEL differs
INSERT INTO TESTUSER.NUMPK_SOURCE VALUES (1, 100.5, 'source label A');
INSERT INTO TESTUSER.NUMPK_TARGET VALUES (1, 100.5, 'old label A');

-- Row (2, 200.999999): INSERT — source only, exercises NUMBER(15,6) binding precision
INSERT INTO TESTUSER.NUMPK_SOURCE VALUES (2, 200.999999, 'source label B');

-- Row (3, 0.000001): INSERT — minimum-scale value, exercises edge of NUMBER(15,6)
INSERT INTO TESTUSER.NUMPK_SOURCE VALUES (3, 0.000001, 'min scale label');

-- Row (4, 100.5): UPDATE — dedicated to trimmed-decimal pkMap binding test
-- Source and target have the SAME PK but different LABELs.
INSERT INTO TESTUSER.NUMPK_SOURCE VALUES (4, 100.5, 'trimmed source label');
INSERT INTO TESTUSER.NUMPK_TARGET VALUES (4, 100.5, 'trimmed old label');

COMMIT;

-- ============================================================
-- HEL-130 lifecycle tables (PkgroveKitLifecycleTest)
-- Prove pool ownership / transaction atomicity / cancellation /
-- connection cleanup for the service's adopted PkgroveKit path.
--
-- LIFECYCLE_TARGET carries a DEFERRABLE INITIALLY DEFERRED check
-- constraint: a write of AMOUNT < 0 succeeds at statement time and
-- only fails at COMMIT (ORA-02091/ORA-02290). That gives a genuine
-- "write applied, then mid-operation failure" window to prove the
-- service transaction rolls back with nothing half-applied.
-- Rows are dedicated per test — do not reuse across tests.
-- ============================================================
CREATE TABLE TESTUSER.LIFECYCLE_SOURCE (
    ID     NUMBER(10) PRIMARY KEY,
    AMOUNT NUMBER(10),
    NOTE   VARCHAR2(100)
);

CREATE TABLE TESTUSER.LIFECYCLE_TARGET (
    ID     NUMBER(10) PRIMARY KEY,
    AMOUNT NUMBER(10),
    NOTE   VARCHAR2(100),
    CONSTRAINT ck_lifecycle_tgt_amount CHECK (AMOUNT >= 0) DEFERRABLE INITIALLY DEFERRED
);

-- Row 1: UPDATE approval commit test (source values are valid)
INSERT INTO TESTUSER.LIFECYCLE_SOURCE VALUES (1, 10, 'source-one');
INSERT INTO TESTUSER.LIFECYCLE_TARGET VALUES (1, 0, 'target-old');

-- Row 2: UPDATE approval rollback test (source AMOUNT violates the
-- deferred target constraint -> statement succeeds, commit fails)
INSERT INTO TESTUSER.LIFECYCLE_SOURCE VALUES (2, -5, 'negative update source');
INSERT INTO TESTUSER.LIFECYCLE_TARGET VALUES (2, 3, 'target-two');

-- Row 3: INSERT approval rollback test (source only, negative amount)
INSERT INTO TESTUSER.LIFECYCLE_SOURCE VALUES (3, -7, 'negative insert source');

-- Row 4: INSERT approval success after repeated failures (cleanup test)
INSERT INTO TESTUSER.LIFECYCLE_SOURCE VALUES (4, 40, 'insert-me');

-- Row 5: cancellation test (target row gets locked, in-flight approve killed)
INSERT INTO TESTUSER.LIFECYCLE_SOURCE VALUES (5, 50, 'cancel-src');
INSERT INTO TESTUSER.LIFECYCLE_TARGET VALUES (5, 5, 'cancel-old');

-- Row 6: service patch-path rollback test (target only)
INSERT INTO TESTUSER.LIFECYCLE_TARGET VALUES (6, 60, 'patch-rollback');

-- Row 8: service patch-path commit test (target only)
INSERT INTO TESTUSER.LIFECYCLE_TARGET VALUES (8, 80, 'patch-commit');

-- Row 9: pool-ownership battery write (target only)
INSERT INTO TESTUSER.LIFECYCLE_TARGET VALUES (9, 90, 'ownership');

COMMIT;
