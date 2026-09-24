package com.auditpatchx.resource

import com.auditpatchx.OracleTestResource
import com.auditpatchx.model.*
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.*
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder

/**
 * The two write endpoints that TableResourceTest never exercised over HTTP:
 * POST /api/record/insert and POST /api/compare/review — every success and
 * error response, against the live Oracle container.
 *
 * Fixture ownership (test-schema.sql): DEPARTMENT ids >= 100 and JOB_HISTORY
 * (4, 2022-01-01) are created here; ALLTYPE rows 30/31 are reserved for the
 * review tests. Nothing else reads them.
 */
@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("TableResource insert and compare-review endpoints")
class TableResourceWriteReviewTest {

    @Nested
    @DisplayName("POST /api/record/insert")
    inner class InsertTests {

        private fun department(id: Int, name: String, vararg extra: Pair<String, Any?>) = InsertRequest(
            schema = "TESTUSER",
            table = "DEPARTMENT",
            values = mapOf("DEPT_ID" to id, "DEPT_NAME" to name, *extra),
            reason = "insert endpoint test"
        )

        private fun getDepartment(id: Int) = given()
            .contentType(ContentType.JSON)
            .body(GetByPkRequest("TESTUSER", "DEPARTMENT", mapOf("DEPT_ID" to id)))
            .`when`().post("/api/record/get")
            .then()

        @Test
        @DisplayName("Inserts a row, converts string numbers, and returns the persisted row with 201")
        fun testInsertSuccess() {
            given()
                .contentType(ContentType.JSON)
                .body(department(100, "Quality", "LOCATION" to "Austin", "BUDGET" to "250000.50"))
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(201)
                .body("inserted", equalTo(1))
                .body("row.DEPT_ID", equalTo(100))
                .body("row.DEPT_NAME", equalTo("Quality"))
                .body("row.LOCATION", equalTo("Austin"))
                .body("row.BUDGET", equalTo(250000.5f))

            getDepartment(100)
                .statusCode(200)
                .body("row.DEPT_NAME", equalTo("Quality"))
        }

        @Test
        @DisplayName("Inserts a composite-PK row with a DATE value and reads it back by that PK")
        fun testInsertCompositePkWithDate() {
            val request = InsertRequest(
                schema = "TESTUSER",
                table = "JOB_HISTORY",
                values = mapOf(
                    "EMPLOYEE_ID" to 4,
                    "START_DATE" to "2022-01-01",
                    "JOB_TITLE" to "HR Analyst",
                    "DEPARTMENT_ID" to 3
                ),
                reason = "composite insert"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(201)
                .body("inserted", equalTo(1))
                .body("row.JOB_TITLE", equalTo("HR Analyst"))
                .body("row.START_DATE", startsWith("2022-01-01"))
                .body("row.END_DATE", nullValue())
        }

        @Test
        @DisplayName("Blank and null values are dropped so column defaults apply")
        fun testBlankValuesDropped() {
            given()
                .contentType(ContentType.JSON)
                .body(department(101, "Legal", "LOCATION" to "", "BUDGET" to null))
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(201)
                .body("row.DEPT_NAME", equalTo("Legal"))
                .body("row.LOCATION", nullValue())
                .body("row.BUDGET", nullValue())
        }

        @Test
        @DisplayName("A blank reason is a 400")
        fun testBlankReason() {
            given()
                .contentType(ContentType.JSON)
                .body(department(102, "Never").copy(reason = "  "))
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(400)
                .body("error", equalTo("Reason is required"))

            getDepartment(102).statusCode(404)
        }

        @Test
        @DisplayName("No usable values is a 400")
        fun testNoValues() {
            val request = InsertRequest(
                schema = "TESTUSER",
                table = "DEPARTMENT",
                values = mapOf("LOCATION" to "", "BUDGET" to null),
                reason = "nothing to insert"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(400)
                .body("error", equalTo("No values provided for insert"))
        }

        @Test
        @DisplayName("A table outside the allowlist is a 403")
        fun testTableNotAllowlisted() {
            given()
                .contentType(ContentType.JSON)
                .body(department(103, "Nope").copy(table = "SPARSE_PK_TARGET"))
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())
        }

        @Test
        @DisplayName("An unknown column is a 403 without details")
        fun testUnknownColumn() {
            given()
                .contentType(ContentType.JSON)
                .body(department(104, "Nope", "NO_SUCH_COLUMN" to "x"))
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(403)
                .body("error", equalTo("Access denied"))
                .body("details", nullValue())

            getDepartment(104).statusCode(404)
        }

        @Test
        @DisplayName("A duplicate primary key is a sanitized 500")
        fun testDuplicatePk() {
            given()
                .contentType(ContentType.JSON)
                .body(department(1, "Engineering again"))
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(500)
                .body("error", equalTo("Insert failed"))
                .body("details", nullValue())

            getDepartment(1)
                .statusCode(200)
                .body("row.DEPT_NAME", equalTo("Engineering"))
        }

        @Test
        @DisplayName("A missing configured PK value is a 400 and the insert is rolled back")
        fun testMissingPkRollsBack() {
            // TZPK_SOURCE has no PK constraint (Oracle Free refuses TIMESTAMP WITH TIME
            // ZONE keys), so the INSERT itself succeeds; only the configured-PK check
            // (EVENT_ID, EVENT_TS) fails afterwards. The transaction must roll back.
            val request = InsertRequest(
                schema = "TESTUSER",
                table = "TZPK_SOURCE",
                values = mapOf("PAYLOAD" to "no pk over http"),
                reason = "rollback regression"
            )

            given()
                .contentType(ContentType.JSON)
                .body(request)
                .`when`().post("/api/record/insert")
                .then()
                .statusCode(400)
                .body("error", equalTo("PK column EVENT_ID must be provided"))

            given()
                .contentType(ContentType.JSON)
                .body(QueryRequest(schema = "TESTUSER", table = "TZPK_SOURCE", limit = 50))
                .`when`().post("/api/query/pk")
                .then()
                .statusCode(200)
                .body("rows.size()", equalTo(3))
                .body("rows.PAYLOAD", not(hasItem("no pk over http")))
        }
    }

    @Nested
    @DisplayName("POST /api/compare/review")
    @TestMethodOrder(MethodOrderer.OrderAnnotation::class)
    inner class ReviewTests {

        private fun review(
            status: String,
            rowStatus: String,
            pk: String = "30",
            tableTwo: String = "TESTUSER.ALLTYPE_TARGET"
        ) = CompareReviewRequest(
            pk = pk,
            status = status,
            tableOne = "TESTUSER.ALLTYPE_SOURCE",
            tableTwo = tableTwo,
            rowStatus = rowStatus,
            syncPk = listOf("ID"),
            ignoreColumns = emptyList(),
            pkMap = mapOf("ID" to pk)
        )

        private fun post(request: CompareReviewRequest) = given()
            .contentType(ContentType.JSON)
            .body(request)
            .`when`().post("/api/compare/review")
            .then()

        private fun target(id: Int) = given()
            .contentType(ContentType.JSON)
            .body(GetByPkRequest("TESTUSER", "ALLTYPE_TARGET", mapOf("ID" to id)))
            .`when`().post("/api/record/get")
            .then()

        @Test
        @Order(1)
        @DisplayName("REJECTED is acknowledged with 200 and the target is untouched")
        fun testRejected() {
            post(review("REJECTED", "UPDATE"))
                .statusCode(200)
                .body("pk", equalTo("30"))
                .body("status", equalTo("REJECTED"))

            target(30)
                .statusCode(200)
                .body("row.STR_VAL", equalTo("http review stale 30"))
        }

        @Test
        @Order(2)
        @DisplayName("An unknown status is a 400 with the validation message")
        fun testUnknownStatus() {
            post(review("MAYBE", "UPDATE"))
                .statusCode(400)
                .body("error", equalTo("status must be APPROVED or REJECTED"))
        }

        @Test
        @Order(3)
        @DisplayName("An unsupported rowStatus is a 400 naming it")
        fun testUnsupportedRowStatus() {
            post(review("APPROVED", "DELETE"))
                .statusCode(400)
                .body("error", containsString("Unsupported rowStatus: DELETE"))

            target(30)
                .statusCode(200)
                .body("row.STR_VAL", equalTo("http review stale 30"))
        }

        @Test
        @Order(4)
        @DisplayName("A missing source row is a 500 that names the root cause")
        fun testMissingSourceRow() {
            post(review("APPROVED", "UPDATE", pk = "9999"))
                .statusCode(500)
                .body("error", startsWith("Review failed: NotFoundException: Source row not found"))
        }

        @Test
        @Order(5)
        @DisplayName("APPROVED UPDATE copies the source row into the target")
        fun testApprovedUpdate() {
            post(review("APPROVED", "UPDATE"))
                .statusCode(200)
                .body("pk", equalTo("30"))
                .body("status", equalTo("APPROVED"))

            target(30)
                .statusCode(200)
                .body("row.INT_VAL", equalTo(300))
                .body("row.STR_VAL", equalTo("http review source 30"))
                .body("row.CLOB_VAL", equalTo("clob 30"))
        }

        @Test
        @Order(6)
        @DisplayName("APPROVED INSERT creates the target row")
        fun testApprovedInsert() {
            target(31).statusCode(404)

            post(review("APPROVED", "INSERT", pk = "31"))
                .statusCode(200)
                .body("pk", equalTo("31"))
                .body("status", equalTo("APPROVED"))

            target(31)
                .statusCode(200)
                .body("row.INT_VAL", equalTo(310))
                .body("row.STR_VAL", equalTo("http review insert 31"))
                .body("row.CLOB_VAL", equalTo("clob 31"))
        }

        @Test
        @Order(7)
        @DisplayName("A target outside the allowlist is refused (pinned: 500 naming SecurityException, unlike the 403 of the other endpoints)")
        fun testTargetNotAllowlisted() {
            // Pinned, not endorsed: the review endpoint maps every non-IAE failure to a
            // 500 that carries the root-cause class and message, so an allowlist refusal
            // is reported differently from /api/record/* (403 "Access denied").
            post(review("APPROVED", "UPDATE", tableTwo = "TESTUSER.SPARSE_PK_TARGET"))
                .statusCode(500)
                .body("error", startsWith("Review failed: SecurityException"))
                .body("error", containsString("not in allowlist"))
        }
    }
}
