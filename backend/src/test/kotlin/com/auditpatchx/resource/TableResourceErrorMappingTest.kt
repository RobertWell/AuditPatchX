package com.auditpatchx.resource

import com.auditpatchx.OracleTestResource
import com.auditpatchx.model.*
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.*
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/**
 * HTTP-level status mapping that TableResourceTest does not reach: Oracle
 * errors surface as sanitized 500s (no details leak), validation failures as
 * 400/403, plus the compare/validate edge cases (partial-PK filters, rows
 * without a sync PK, malformed names, views, per-column type mismatches).
 */
@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("TableResource error mapping and edge cases")
class TableResourceErrorMappingTest {

    @Nested
    @DisplayName("GET /api/health")
    inner class HealthTests {

        @Test
        @DisplayName("Health reports UP with the application name")
        fun testHealth() {
            given()
                .`when`().get("/api/health")
                .then()
                .statusCode(200)
                .contentType(ContentType.JSON)
                .body("status", equalTo("UP"))
                .body("application", equalTo("AuditPatchX Backend"))
        }
    }

    @Nested
    @DisplayName("Allowlisted table missing from the database (config drift)")
    inner class PhantomTableTests {

        @Test
        @DisplayName("Metadata for an allowlisted-but-missing table is a 403, not a 500")
        fun testMetadata() {
            given()
                .`when`().get("/api/db/tables/TESTUSER/PHANTOM_TABLE")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("Query on an allowlisted-but-missing table is a 403, not a 500")
        fun testQuery() {
            given()
                .contentType(ContentType.JSON)
                .body(QueryRequest(schema = "TESTUSER", table = "PHANTOM_TABLE", limit = 10))
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }
    }

    @Nested
    @DisplayName("POST /api/query/pk - operators, limits, binding errors")
    inner class QueryTests {

        private fun deptQuery(op: String, value: Any) = QueryRequest(
            schema = "TESTUSER",
            table = "DEPARTMENT",
            filters = listOf(FilterCondition(col = "DEPT_ID", op = op, value = value)),
            limit = 50
        )

        @Test
        @DisplayName("lt operator binds against a NUMBER column")
        fun testLessThan() {
            // DEPARTMENT seeds DEPT_ID 1..3; the insert tests only add ids >= 100.
            given()
                .contentType(ContentType.JSON)
                .body(deptQuery("lt", 3))
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("rows.DEPT_ID", containsInAnyOrder(1, 2))
        }

        @Test
        @DisplayName("lte operator binds against a NUMBER column")
        fun testLessThanOrEqual() {
            given()
                .contentType(ContentType.JSON)
                .body(deptQuery("lte", 3))
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("rows.DEPT_ID", containsInAnyOrder(1, 2, 3))
        }

        @Test
        @DisplayName("A limit below 1 is coerced to a single row")
        fun testLimitCoercedToOne() {
            val request = QueryRequest(schema = "TESTUSER", table = "EMPLOYEE", limit = 0)

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("rows.size()", equalTo(1))
        }

        @Test
        @DisplayName("A non-numeric value for a NUMBER filter is a sanitized 500")
        fun testNonNumericFilterValue() {
            // "abc" cannot become a BigDecimal, is bound verbatim, and Oracle raises ORA-01722.
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(FilterCondition(col = "SALARY", op = "eq", value = "abc")),
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
    @DisplayName("POST /api/record/get - temporal PK forms and binding errors")
    inner class GetByPkTests {

        private fun jobHistory(startDate: String) = GetByPkRequest(
            schema = "TESTUSER",
            table = "JOB_HISTORY",
            pk = mapOf("EMPLOYEE_ID" to 2, "START_DATE" to startDate)
        )

        @Test
        @DisplayName("A DATE PK accepts ISO local, offset, zoned and space-separated forms")
        fun testTemporalPkForms() {
            listOf(
                "2020-03-20T00:00:00",          // LocalDateTime
                "2020-03-20T00:00:00+00:00",    // OffsetDateTime
                "2020-03-20T00:00:00Z[UTC]",    // ZonedDateTime
                "2020-03-20 00:00:00",          // yyyy-MM-dd HH:mm:ss
                "2020-03-20 00:00:00.000"       // ... with millis
            ).forEach { form ->
                given()
                    .contentType(ContentType.JSON)
                    .body(jobHistory(form))
                    .`when`().post("/api/record/get")
                    .then()
                    .statusCode(200)
                    .body("row.JOB_TITLE", equalTo("Junior Developer"))
            }
        }

        @Test
        @DisplayName("An unparseable DATE PK is bound as text and surfaces as a sanitized 500")
        fun testUnparseableTemporalPk() {
            given()
                .contentType(ContentType.JSON)
                .body(jobHistory("not-a-date"))
                .`when`().post("/api/record/get")
                .then()
                .statusCode(500)
                .body("error", equalTo("Get failed"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("A non-numeric NUMBER PK surfaces as a sanitized 500")
        fun testNonNumericPk() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to "abc")
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/get")
                .then()
                .statusCode(500)
                .body("error", equalTo("Get failed"))
                .body("details", nullValue())
        }
    }

    @Nested
    @DisplayName("POST /api/record/validate-patch and /api/record/update - readonly and DB errors")
    inner class PatchTests {

        @Test
        @DisplayName("validate-patch rejects a readonly column with 400")
        fun testValidatePatchReadonlyColumn() {
            // ui.readonly.columns includes UPDATED_BY; COMPARE_SOURCE carries that column.
            val request = ValidatePatchRequest(
                schema = "TESTUSER",
                table = "COMPARE_SOURCE",
                pk = mapOf("ID" to 2),
                set = mapOf("UPDATED_BY" to "someone")
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/validate-patch")
                .then()
                .statusCode(400)
                .body("ok", equalTo(false))
                .body("error", containsString("readonly"))
                .body("error", containsString("UPDATED_BY"))
        }

        @Test
        @DisplayName("update rejects a readonly column with 403 and leaves the row untouched")
        fun testUpdateReadonlyColumn() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "COMPARE_SOURCE",
                pk = mapOf("ID" to 2),
                set = mapOf("UPDATED_BY" to "someone"),
                reason = "readonly regression"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())

            given()
                .contentType(ContentType.JSON)
                .body(GetByPkRequest("TESTUSER", "COMPARE_SOURCE", mapOf("ID" to 2)))
                .`when`().post("/api/record/get")
                .then()
                .statusCode(200)
                .body("row.UPDATED_BY", equalTo("SOURCE_USER"))
        }

        @Test
        @DisplayName("update violating a NOT NULL constraint is a sanitized 500 and rolls back")
        fun testUpdateNotNullViolation() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 4),
                set = mapOf("FIRST_NAME" to null),
                reason = "constraint regression"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(500)
                .body("error", equalTo("Update failed"))
                .body("details", nullValue())

            given()
                .contentType(ContentType.JSON)
                .body(GetByPkRequest("TESTUSER", "EMPLOYEE", mapOf("EMP_ID" to 4)))
                .`when`().post("/api/record/get")
                .then()
                .statusCode(200)
                .body("row.FIRST_NAME", equalTo("Alice"))
        }

        @Test
        @DisplayName("update of a missing PK reports updated=0 with an empty row (pinned, not 404)")
        fun testUpdateMissingPk() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 999),
                set = mapOf("SALARY" to 1),
                reason = "missing pk"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/update")
                .then()
                .statusCode(200)
                .body("updated", equalTo(0))
                .body("row", anEmptyMap<String, Any>())
        }
    }

    @Nested
    @DisplayName("POST /api/compare/job - filters, skipped rows, malformed names")
    inner class CompareJobTests {

        private fun compareSource(pkFilter: Map<String, String> = emptyMap()) = CompareJobRequest(
            tableOne = "TESTUSER.COMPARE_SOURCE",
            tableTwo = "TESTUSER.COMPARE_TARGET",
            syncPk = listOf("ID"),
            ignoreColumns = listOf("UPDATED_BY"),
            limit = 100,
            pkFilter = pkFilter
        )

        @Test
        @DisplayName("A malformed table name (no schema) is a sanitized 500")
        fun testMalformedTableName() {
            val request = compareSource().copy(tableOne = "COMPARE_SOURCE")

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(500)
                .body("error", equalTo("Compare failed"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("pkFilter narrows the scanned source set (key case-insensitive)")
        fun testPkFilterNarrowsScan() {
            given()
                .contentType(ContentType.JSON)
                .body(compareSource(pkFilter = mapOf("id" to "1")))
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(200)
                .body("scannedRows", equalTo(1))
                .body("limitReached", equalTo(false))
                .body("differences.size()", equalTo(1))
                .body("differences[0].pk", equalTo("1"))
                .body("differences[0].status", equalTo("UPDATE"))
        }

        @Test
        @DisplayName("A blank pkFilter value is a wildcard")
        fun testBlankPkFilterIsWildcard() {
            given()
                .contentType(ContentType.JSON)
                .body(compareSource(pkFilter = mapOf("ID" to "   ")))
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(200)
                .body("scannedRows", equalTo(9))
                .body("differences.size()", equalTo(6))
        }

        @Test
        @DisplayName("pkFilter on a column the source does not have is refused with 403")
        fun testPkFilterUnknownColumn() {
            given()
                .contentType(ContentType.JSON)
                .body(compareSource(pkFilter = mapOf("NO_SUCH_COLUMN" to "1")))
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("Source rows without a sync-PK value are skipped but still counted as scanned")
        fun testRowsWithoutPkAreSkipped() {
            val request = CompareJobRequest(
                tableOne = "TESTUSER.SPARSE_PK_SOURCE",
                tableTwo = "TESTUSER.SPARSE_PK_TARGET",
                syncPk = listOf("ID"),
                ignoreColumns = emptyList(),
                limit = 100
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/compare/job")
                .then()
                .statusCode(200)
                .body("scannedRows", equalTo(2))
                .body("differences.size()", equalTo(1))
                .body("differences[0].pk", equalTo("1"))
                .body("differences[0].status", equalTo("UPDATE"))
                .body("differences[0].changes.column", contains("VALUE"))
                .body("differences[0].changes[0].sourceValue", equalTo("sparse source"))
                .body("differences[0].changes[0].targetValue", equalTo("sparse target"))
        }
    }

    @Nested
    @DisplayName("POST /api/compare/validate - refusals and mismatch reporting")
    inner class CompareValidateTests {

        private fun validate(tableOne: String, tableTwo: String) = given()
            .contentType(ContentType.JSON)
            .body(CompareValidationRequest(tableOne = tableOne, tableTwo = tableTwo))
            .`when`().post("/api/compare/validate")
            .then()

        @Test
        @DisplayName("A table that does not exist is refused with 403")
        fun testMissingTable() {
            validate("TESTUSER.EMPLOYEE", "TESTUSER.NO_SUCH_TABLE")
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("A malformed table name (no schema) is a 400")
        fun testMalformedTableName() {
            validate("EMPLOYEE", "TESTUSER.EMPLOYEE")
                .statusCode(400)
                .body("error", equalTo("Invalid request"))
        }

        @Test
        @DisplayName("A view has JDBC columns but is not a base table: refused with 400")
        fun testViewIsNotATable() {
            validate("TESTUSER.EMPLOYEE_VIEW", "TESTUSER.EMPLOYEE")
                .statusCode(400)
                .body("error", equalTo("Invalid request"))
        }

        @Test
        @DisplayName("Reports a per-column type mismatch when the PKs agree")
        fun testTypeMismatchReported() {
            // TSPK_SOURCE.EVENT_TS is TIMESTAMP(6); TZPK_SOURCE.EVENT_TS is TIMESTAMP(6) WITH TIME ZONE.
            validate("TESTUSER.TSPK_SOURCE", "TESTUSER.TZPK_SOURCE")
                .statusCode(200)
                .body("compatible", equalTo(false))
                .body("pkMatch", equalTo(true))
                .body("columnTypeMatch", equalTo(false))
                .body("missingInTableOne.size()", equalTo(0))
                .body("missingInTableTwo.size()", equalTo(0))
                .body("mismatchedTypes.size()", equalTo(1))
                .body("mismatchedTypes[0].column", equalTo("EVENT_TS"))
                .body("mismatchedTypes[0].tableOneType", equalTo("TIMESTAMP(6)"))
                .body("mismatchedTypes[0].tableTwoType", equalTo("TIMESTAMP(6) WITH TIME ZONE"))
                .body("details", equalTo("Column name/type mismatch detected between the two tables"))
        }

        @Test
        @DisplayName("Reports columns missing on either side, sorted")
        fun testMissingColumnsReported() {
            validate("TESTUSER.COMPARE_SOURCE", "TESTUSER.DIRECTION_A")
                .statusCode(200)
                .body("compatible", equalTo(false))
                .body("pkMatch", equalTo(true))
                .body("columnTypeMatch", equalTo(false))
                .body("missingInTableOne", contains("VALUE"))
                .body("missingInTableTwo", contains("DESCRIPTION", "STATUS", "UPDATED_BY"))
                .body("mismatchedTypes.size()", equalTo(0))
        }
    }
}
