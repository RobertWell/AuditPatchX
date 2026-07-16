package com.auditpatchx.resource

import com.auditpatchx.OracleTestResource
import com.auditpatchx.model.*
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested

@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("TableResource API Tests")
class TableResourceTest {

    @Nested
    @DisplayName("Compare Configuration and Validation")
    inner class CompareConfigTests {

        @Test
        @DisplayName("Should return sync pairs array from /api/compare/config")
        fun testGetCompareConfig() {
            // sync-tables.pairs is absent from test application.yml (avoids SRCFG00050
            // in CI fresh builds). The endpoint must respond 200 with a JSON array.
            // Pair-specific content is tested in integration/ArgoCD environments.
            given()
                .`when`().get("/api/compare/config")
                .then()
                .statusCode(200)
                .contentType(ContentType.JSON)
                .body("$", notNullValue())
        }

        @Test
        @DisplayName("Should validate compatible tables")
        fun testValidateCompareCompatibleTables() {
            val request = CompareValidationRequest(
                tableOne = "TESTUSER.EMPLOYEE",
                tableTwo = "TESTUSER.EMPLOYEE"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/compare/validate")
                .then()
                .statusCode(200)
                .body("compatible", equalTo(true))
                .body("pkMatch", equalTo(true))
                .body("columnTypeMatch", equalTo(true))
                .body("mismatchedTypes.size()", equalTo(0))
        }

        @Test
        @DisplayName("Should validate incompatible tables by pk")
        fun testValidateCompareIncompatiblePk() {
            val request = CompareValidationRequest(
                tableOne = "TESTUSER.EMPLOYEE",
                tableTwo = "TESTUSER.DEPARTMENT"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/compare/validate")
                .then()
                .statusCode(200)
                .body("compatible", equalTo(false))
                .body("pkMatch", equalTo(false))
        }

        @Test
        @DisplayName("Should compare tables with long text and ignored columns")
        fun testCompareJobLongTextAndIgnoredColumns() {
            val request = CompareJobRequest(
                tableOne = "TESTUSER.COMPARE_SOURCE",
                tableTwo = "TESTUSER.COMPARE_TARGET",
                syncPk = listOf("ID"),
                ignoreColumns = listOf("UPDATED_BY"),
                limit = 100
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(200)
                // Explicit per-status counts (HEL-27): UPDATE=4 (PK 1, 5, 6, 8),
                // INSERT=2 (PK 3, 9); PK 2/4/7 must be absent.
                .body("differences.size()", equalTo(6))
                .body("differences.findAll { it.status == 'UPDATE' }.size()", equalTo(4))
                .body("differences.findAll { it.status == 'INSERT' }.size()", equalTo(2))
                .body("differences.findAll { it.status == 'DELETE' }.size()", equalTo(0))
                .body("differences.find { it.pk == '1' }.status", equalTo("UPDATE"))
                .body("differences.find { it.pk == '1' }.changedColumns", equalTo(2))
                .body("differences.find { it.pk == '1' }.changes.column", containsInAnyOrder("STATUS", "DESCRIPTION"))
                .body("differences.find { it.pk == '1' }.changes.find { it.column == 'DESCRIPTION' }.isLongText", equalTo(true))
                .body("differences.find { it.pk == '1' }.changes.column", not(hasItem("UPDATED_BY")))
                .body("differences.find { it.pk == '2' }", nullValue())
                .body("differences.find { it.pk == '3' }.status", equalTo("INSERT"))
                // CLOB LF-vs-CRLF only -> equal, no UPDATE row
                .body("differences.find { it.pk == '4' }", nullValue())
                // real CLOB difference -> exactly one UPDATE with only DESCRIPTION changed
                .body("differences.find { it.pk == '5' }.status", equalTo("UPDATE"))
                .body("differences.find { it.pk == '5' }.changedColumns", equalTo(1))
                .body("differences.find { it.pk == '5' }.changes.column", containsInAnyOrder("DESCRIPTION"))
                // NON-CLOB (VARCHAR2) LF-vs-CRLF must STILL be a difference
                .body("differences.find { it.pk == '6' }.status", equalTo("UPDATE"))
                .body("differences.find { it.pk == '6' }.changes.column", containsInAnyOrder("STATUS"))
                // null vs null CLOB -> equal
                .body("differences.find { it.pk == '7' }", nullValue())
                // null vs non-null CLOB -> different
                .body("differences.find { it.pk == '8' }.status", equalTo("UPDATE"))
                .body("differences.find { it.pk == '8' }.changes.column", containsInAnyOrder("DESCRIPTION"))
                // source-only multiline CLOB -> INSERT
                .body("differences.find { it.pk == '9' }.status", equalTo("INSERT"))
        }

        @Test
        @DisplayName("Should reject injected compare PK identifiers")
        fun testCompareJobRejectsInjectedPkIdentifier() {
            val injectedPk = "ID) OR 1=1 --"
            val request = CompareJobRequest(
                tableOne = "TESTUSER.COMPARE_SOURCE",
                tableTwo = "TESTUSER.COMPARE_TARGET",
                syncPk = listOf(injectedPk),
                ignoreColumns = listOf("UPDATED_BY"),
                limit = 100
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("Should reject injected compare ignored column identifiers")
        fun testCompareJobRejectsInjectedIgnoreColumnIdentifier() {
            val injectedColumn = "UPDATED_BY FROM TESTUSER.COMPARE_TARGET --"
            val request = CompareJobRequest(
                tableOne = "TESTUSER.COMPARE_SOURCE",
                tableTwo = "TESTUSER.COMPARE_TARGET",
                syncPk = listOf("ID"),
                ignoreColumns = listOf(injectedColumn),
                limit = 100
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }
    }

    @Nested
    @DisplayName("GET /api/tables - List Tables")
    inner class ListTablesTests {

        @Test
        @DisplayName("Should list all allowed tables")
        fun testListTables() {
            given()
                .`when`().get("/api/tables")
                .then()
                .statusCode(200)
                .contentType(ContentType.JSON)
                .body("size()", equalTo(17))
                .body("[0].schema", notNullValue())
                .body("[0].table", notNullValue())
                .body("[0].pkColumns", notNullValue())
        }

        @Test
        @DisplayName("Should include EMPLOYEE table in list")
        fun testListContainsEmployee() {
            given()
                .`when`().get("/api/tables")
                .then()
                .statusCode(200)
                .body("find { it.table == 'EMPLOYEE' }.schema", equalTo("TESTUSER"))
                .body("find { it.table == 'EMPLOYEE' }.pkColumns", hasItem("EMP_ID"))
        }
    }

    @Nested
    @DisplayName("POST /api/query/pk - Query Table")
    inner class QueryTests {

        @Test
        @DisplayName("Should query all employees")
        fun testQueryAllEmployees() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                limit = 50
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("columns", notNullValue())
                .body("rows.size()", equalTo(5))
                .body("columns", hasItems("EMP_ID", "FIRST_NAME", "LAST_NAME"))
        }

        @Test
        @DisplayName("Should query with equality filter")
        fun testQueryWithFilter() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "FIRST_NAME", op = "eq", value = "John")
                ),
                limit = 50
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("rows.size()", equalTo(1))
                .body("rows[0].FIRST_NAME", equalTo("John"))
                .body("rows[0].LAST_NAME", equalTo("Doe"))
        }

        @Test
        @DisplayName("Should bind query filter values to prevent SQL injection")
        fun testQueryFilterValueInjectionDoesNotExpandResults() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "FIRST_NAME", op = "eq", value = "John' OR '1'='1")
                ),
                limit = 50
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("rows.size()", equalTo(0))
        }

        @Test
        @DisplayName("Should reject injected query column identifiers without leaking details")
        fun testQueryRejectsInjectedColumnIdentifier() {
            val injectedColumn = "FIRST_NAME) OR 1=1 --"
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = injectedColumn, op = "eq", value = "John")
                ),
                limit = 50
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("Should query with multiple filters")
        fun testQueryWithMultipleFilters() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "DEPT_ID", op = "eq", value = 1),
                    FilterCondition(col = "SALARY", op = "gte", value = 75000)
                ),
                limit = 50
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("rows.size()", greaterThan(0))
        }

        @Test
        @DisplayName("Should return 403 for unauthorized table")
        fun testQueryUnauthorizedTable() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "UNAUTHORIZED_TABLE",
                limit = 50
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
        }

        @Test
        @DisplayName("Should return 500 for invalid operator")
        fun testQueryInvalidOperator() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "FIRST_NAME", op = "invalid", value = "John")
                ),
                limit = 50
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(500)
                .body("error", equalTo("Query failed"))
                .body("details", nullValue())
        }
    }

    @Nested
    @DisplayName("POST /api/tables/record/get - Get by PK")
    inner class GetByPkTests {

        @Test
        @DisplayName("Should get employee by PK")
        fun testGetByPk() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1)
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/get")
                .then()
                .statusCode(200)
                .body("row.FIRST_NAME", equalTo("John"))
                .body("row.LAST_NAME", equalTo("Doe"))
                .body("row.EMP_ID", notNullValue())
        }

        @Test
        @DisplayName("Should get record by composite PK")
        fun testGetByCompositePk() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "JOB_HISTORY",
                pk = mapOf(
                    "EMPLOYEE_ID" to 2,
                    "START_DATE" to "2020-03-20"
                )
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/get")
                .then()
                .statusCode(200)
                .body("row.JOB_TITLE", equalTo("Junior Developer"))
        }

        @Test
        @DisplayName("Should reject incomplete composite PK")
        fun testGetByCompositePkRequiresAllColumns() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "JOB_HISTORY",
                pk = mapOf("EMPLOYEE_ID" to 2)
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/get")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("Should return 404 for non-existent record")
        fun testGetByPkNotFound() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 999)
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/get")
                .then()
                .statusCode(404)
                .body("error", equalTo("Row not found"))
        }

        @Test
        @DisplayName("Should return 403 for invalid PK columns")
        fun testGetByPkInvalidColumns() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("INVALID_COL" to 1)
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/get")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
        }
    }

    @Nested
    @DisplayName("POST /api/tables/record/validate-patch - Validate Patch")
    inner class ValidatePatchTests {

        @Test
        @DisplayName("Should validate valid patch")
        fun testValidateValidPatch() {
            val request = ValidatePatchRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("SALARY" to 90000)
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/validate-patch")
                .then()
                .statusCode(200)
                .body("ok", equalTo(true))
                .body("normalizedSet", notNullValue())
        }

        @Test
        @DisplayName("Should reject patch with invalid columns")
        fun testValidateInvalidColumns() {
            val request = ValidatePatchRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("INVALID_COLUMN" to "value")
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/validate-patch")
                .then()
                .statusCode(400)
                .body("ok", equalTo(false))
                .body("error", notNullValue())
        }

        @Test
        @DisplayName("Should reject patch attempting to modify PK")
        fun testValidatePatchModifyingPk() {
            val request = ValidatePatchRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("EMP_ID" to 999)
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/validate-patch")
                .then()
                .statusCode(400)
                .body("ok", equalTo(false))
                .body("error", containsString("primary key"))
        }
    }

    @Nested
    @DisplayName("POST /api/tables/record/update - Update Record")
    inner class UpdateTests {

        @Test
        @DisplayName("Should update employee salary")
        fun testUpdateEmployeeSalary() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 3),
                set = mapOf("SALARY" to 70000),
                reason = "Annual salary review"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(200)
                .body("updated", equalTo(1))
                .body("row.SALARY", notNullValue())
        }

        @Test
        @DisplayName("Should update multiple fields")
        fun testUpdateMultipleFields() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 5),
                set = mapOf(
                    "EMAIL" to "charlie.updated@example.com",
                    "PHONE" to "555-8888"
                ),
                reason = "Update contact information"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(200)
                .body("updated", equalTo(1))
                .body("row.EMAIL", equalTo("charlie.updated@example.com"))
                .body("row.PHONE", equalTo("555-8888"))
        }

        @Test
        @DisplayName("Should update a row selected by composite PK")
        fun testUpdateCompositePkRecord() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "JOB_HISTORY",
                pk = mapOf(
                    "EMPLOYEE_ID" to 2,
                    "START_DATE" to "2021-03-21"
                ),
                set = mapOf("JOB_TITLE" to "Principal Developer"),
                reason = "Regression test composite PK update"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(200)
                .body("updated", equalTo(1))
                .body("row.JOB_TITLE", equalTo("Principal Developer"))
        }

        @Test
        @DisplayName("Should update and fetch CLOB with SQL-like special characters")
        fun testUpdateClobWithSqlSpecialCharacters() {
            val clobText = """
                select transaction_id, status, amount
                from trdmgmr.transactions
                where status = 'APPROVED'
                  and note = q'[free typing: ; -- /* */ ' " ${'$'} { } ]'
                  and payload like '%100%'
                order by event_ts desc
            """.trimIndent()

            val updateRequest = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("BIO" to clobText),
                reason = "Regression test CLOB SQL text"
            )

            given()
                .contentType(ContentType.JSON)
                .body(updateRequest)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(200)
                .body("updated", equalTo(1))
                .body("row.BIO", equalTo(clobText))

            val getRequest = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1)
            )

            given()
                .contentType(ContentType.JSON)
                .body(getRequest)
                .`when`().post("/api/record/get")
                .then()
                .statusCode(200)
                .body("row.BIO", equalTo(clobText))
        }

        @Test
        @DisplayName("Should return 400 when reason is missing")
        fun testUpdateMissingReason() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("SALARY" to 90000),
                reason = ""
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(400)
                .body("error", equalTo("Reason is required"))
        }

        @Test
        @DisplayName("Should return 403 when attempting to update PK")
        fun testUpdatePrimaryKey() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("EMP_ID" to 999),
                reason = "Test"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("Should return 403 for invalid columns")
        fun testUpdateInvalidColumn() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("INVALID_COLUMN" to "value"),
                reason = "Test"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }
    }

    @Nested
    @DisplayName("GET /api/db/tables/{schema}/{table} - Get Metadata")
    inner class GetMetadataTests {

        @Test
        @DisplayName("Should get metadata for EMPLOYEE table")
        fun testGetEmployeeMetadata() {
            given()
                .`when`().get("/api/db/tables/TESTUSER/EMPLOYEE")
                .then()
                .statusCode(200)
                .body("pkColumns", hasItem("EMP_ID"))
                .body("columns", notNullValue())
                .body("columns.size()", greaterThan(0))
                .body("columns[0].name", notNullValue())
                .body("columns[0].type", notNullValue())
        }

        @Test
        @DisplayName("Should get metadata for DEPARTMENT table")
        fun testGetDepartmentMetadata() {
            given()
                .`when`().get("/api/db/tables/TESTUSER/DEPARTMENT")
                .then()
                .statusCode(200)
                .body("pkColumns", hasItem("DEPT_ID"))
                .body("columns.find { it.name == 'DEPT_NAME' }", notNullValue())
        }

        @Test
        @DisplayName("Should get metadata for table with composite PK")
        fun testGetMetadataCompositePk() {
            given()
                .`when`().get("/api/db/tables/TESTUSER/JOB_HISTORY")
                .then()
                .statusCode(200)
                .body("pkColumns", hasItems("EMPLOYEE_ID", "START_DATE"))
                .body("pkColumns.size()", equalTo(2))
        }

        @Test
        @DisplayName("Should include column metadata details")
        fun testMetadataIncludesDetails() {
            given()
                .`when`().get("/api/db/tables/TESTUSER/EMPLOYEE")
                .then()
                .statusCode(200)
                .body("columns.find { it.name == 'FIRST_NAME' }.type", notNullValue())
                .body("columns.find { it.name == 'FIRST_NAME' }.nullable", notNullValue())
        }

        @Test
        @DisplayName("Should return 403 for unauthorized table")
        fun testGetMetadataUnauthorizedTable() {
            given()
                .`when`().get("/api/db/tables/TESTUSER/UNAUTHORIZED_TABLE")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
        }
    }
}
