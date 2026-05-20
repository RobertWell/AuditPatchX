package com.auditpatchx.service

import com.auditpatchx.OracleTestResource
import com.auditpatchx.model.*
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("Compare Review Integration Tests")
class CompareReviewServiceTest {

    @Inject
    lateinit var databaseService: DatabaseService

    // --- helpers ---

    private fun approveUpdate(id: String) = databaseService.reviewCompareRow(
        CompareReviewRequest(
            pk = id,
            status = "APPROVED",
            tableOne = "TESTUSER.ALLTYPE_SOURCE",
            tableTwo = "TESTUSER.ALLTYPE_TARGET",
            rowStatus = "UPDATE",
            syncPk = listOf("ID"),
            ignoreColumns = emptyList(),
            pkMap = mapOf("ID" to id)
        )
    )

    private fun approveInsert(id: String) = databaseService.reviewCompareRow(
        CompareReviewRequest(
            pk = id,
            status = "APPROVED",
            tableOne = "TESTUSER.ALLTYPE_SOURCE",
            tableTwo = "TESTUSER.ALLTYPE_TARGET",
            rowStatus = "INSERT",
            syncPk = listOf("ID"),
            ignoreColumns = emptyList(),
            pkMap = mapOf("ID" to id)
        )
    )

    private fun sourceRow(id: Int) =
        databaseService.getByPk(GetByPkRequest("TESTUSER", "ALLTYPE_SOURCE", mapOf("ID" to id))).row

    private fun targetRow(id: Int) =
        databaseService.getByPk(GetByPkRequest("TESTUSER", "ALLTYPE_TARGET", mapOf("ID" to id))).row

    // --- tests ---

    @Nested
    @DisplayName("Approve UPDATE")
    inner class ApproveUpdateTests {

        @Test
        @DisplayName("Copies NUMBER, DECIMAL, VARCHAR2, DATE, TIMESTAMP, CLOB from source to target")
        fun testCopiesAllColumnTypes() {
            approveUpdate("10")

            val src = sourceRow(10)
            val tgt = targetRow(10)

            assertThat(tgt["INT_VAL"]).isEqualTo(src["INT_VAL"])    // NUMBER
            assertThat(tgt["DEC_VAL"]).isEqualTo(src["DEC_VAL"])    // NUMBER(15,6)
            assertThat(tgt["STR_VAL"]).isEqualTo(src["STR_VAL"])    // VARCHAR2
            assertThat(tgt["DATE_VAL"]).isEqualTo(src["DATE_VAL"]) // DATE
            assertThat(tgt["TS_VAL"]).isEqualTo(src["TS_VAL"])      // TIMESTAMP(6)
            assertThat(tgt["CLOB_VAL"]).isEqualTo(src["CLOB_VAL"]) // CLOB
            assertThat(tgt["NULL_VAL"]).isEqualTo(src["NULL_VAL"]) // VARCHAR2
        }

        @Test
        @DisplayName("TIMESTAMP(6) precision preserved — no frontend round-trip degradation")
        fun testTimestampPrecisionPreserved() {
            approveUpdate("10")

            val srcTs = sourceRow(10)["TS_VAL"] as String
            val tgtTs = targetRow(10)["TS_VAL"] as String

            assertThat(tgtTs).isEqualTo(srcTs)
            assertThat(srcTs).contains("10:30:00") // sanity-check known seed data
        }

        @Test
        @DisplayName("NULL column value written to target (not silently skipped)")
        fun testNullColumnWrittenToTarget() {
            approveUpdate("11")

            val tgt = targetRow(11)
            assertThat(tgt["NULL_VAL"]).isNull()
            assertThat(tgt["STR_VAL"]).isEqualTo(sourceRow(11)["STR_VAL"])
        }

        @Test
        @DisplayName("CLOB larger than 4000 chars copied without truncation")
        fun testLargeClobCopied() {
            val largeClob = "x".repeat(5000)
            databaseService.update(
                UpdateRequest(
                    schema = "TESTUSER", table = "ALLTYPE_SOURCE",
                    pk = mapOf("ID" to 12),
                    set = mapOf("CLOB_VAL" to largeClob),
                    reason = "test setup"
                )
            )

            approveUpdate("12")

            val tgtClob = targetRow(12)["CLOB_VAL"] as String
            assertThat(tgtClob).hasSize(5000)
            assertThat(tgtClob).isEqualTo(largeClob)
        }
    }

    @Nested
    @DisplayName("Approve INSERT")
    inner class ApproveInsertTests {

        @Test
        @DisplayName("Inserts source row into target with correct column values")
        fun testInsertsRowWithCorrectValues() {
            approveInsert("20")

            val src = sourceRow(20)
            val tgt = targetRow(20)

            assertThat(tgt["INT_VAL"]).isEqualTo(src["INT_VAL"])
            assertThat(tgt["STR_VAL"]).isEqualTo(src["STR_VAL"])
            assertThat(tgt["CLOB_VAL"]).isEqualTo(src["CLOB_VAL"])
        }
    }

    @Nested
    @DisplayName("SQL Injection Prevention")
    inner class InjectionTests {

        @Test
        @DisplayName("Injected tableOne blocked by allowlist")
        fun testTableOneInjectionBlocked() {
            assertThatThrownBy {
                databaseService.reviewCompareRow(
                    CompareReviewRequest(
                        pk = "10",
                        status = "APPROVED",
                        tableOne = "TESTUSER.ALLTYPE_SOURCE WHERE 1=2 UNION SELECT * FROM DUAL--",
                        tableTwo = "TESTUSER.ALLTYPE_TARGET",
                        rowStatus = "UPDATE",
                        syncPk = listOf("ID"),
                        ignoreColumns = emptyList(),
                        pkMap = mapOf("ID" to "10")
                    )
                )
            }.isInstanceOf(SecurityException::class.java)
        }

        @Test
        @DisplayName("Injected tableTwo blocked by allowlist")
        fun testTableTwoInjectionBlocked() {
            assertThatThrownBy {
                databaseService.reviewCompareRow(
                    CompareReviewRequest(
                        pk = "10",
                        status = "APPROVED",
                        tableOne = "TESTUSER.ALLTYPE_SOURCE",
                        tableTwo = "TESTUSER.ALLTYPE_TARGET WHERE 1=2 UNION SELECT * FROM DUAL--",
                        rowStatus = "UPDATE",
                        syncPk = listOf("ID"),
                        ignoreColumns = emptyList(),
                        pkMap = mapOf("ID" to "10")
                    )
                )
            }.isInstanceOf(SecurityException::class.java)
        }

        @Test
        @DisplayName("Injected syncPk column blocked by column allowlist")
        fun testSyncPkInjectionBlocked() {
            assertThatThrownBy {
                databaseService.reviewCompareRow(
                    CompareReviewRequest(
                        pk = "10",
                        status = "APPROVED",
                        tableOne = "TESTUSER.ALLTYPE_SOURCE",
                        tableTwo = "TESTUSER.ALLTYPE_TARGET",
                        rowStatus = "UPDATE",
                        syncPk = listOf("ID; DROP TABLE TESTUSER.ALLTYPE_TARGET--"),
                        ignoreColumns = emptyList(),
                        pkMap = mapOf("ID" to "10")
                    )
                )
            }.isInstanceOf(SecurityException::class.java)
        }

        @Test
        @DisplayName("Unrecognized status value rejected")
        fun testInvalidStatusRejected() {
            assertThatThrownBy {
                databaseService.reviewCompareRow(
                    CompareReviewRequest(
                        pk = "10",
                        status = "EXPLOIT",
                        tableOne = "TESTUSER.ALLTYPE_SOURCE",
                        tableTwo = "TESTUSER.ALLTYPE_TARGET",
                        rowStatus = "UPDATE",
                        syncPk = listOf("ID"),
                        ignoreColumns = emptyList(),
                        pkMap = mapOf("ID" to "10")
                    )
                )
            }.isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("APPROVED")
        }
    }

    @Nested
    @DisplayName("Error Handling")
    inner class ErrorHandlingTests {

        @Test
        @DisplayName("Throws NotFoundException when source row does not exist")
        fun testSourceRowNotFoundThrows() {
            assertThatThrownBy {
                databaseService.reviewCompareRow(
                    CompareReviewRequest(
                        pk = "9999",
                        status = "APPROVED",
                        tableOne = "TESTUSER.ALLTYPE_SOURCE",
                        tableTwo = "TESTUSER.ALLTYPE_TARGET",
                        rowStatus = "UPDATE",
                        syncPk = listOf("ID"),
                        ignoreColumns = emptyList(),
                        pkMap = mapOf("ID" to "9999")
                    )
                )
            }.isInstanceOf(NotFoundException::class.java)
                .hasMessageContaining("Source row not found")
        }

        @Test
        @DisplayName("REJECTED decision skips DB write and returns response")
        fun testRejectedSkipsWrite() {
            // Capture target state before rejection
            val tgtBefore = targetRow(10)

            val response = databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = "10",
                    status = "REJECTED",
                    tableOne = "TESTUSER.ALLTYPE_SOURCE",
                    tableTwo = "TESTUSER.ALLTYPE_TARGET",
                    rowStatus = "UPDATE",
                    syncPk = listOf("ID"),
                    ignoreColumns = emptyList(),
                    pkMap = mapOf("ID" to "10")
                )
            )

            assertThat(response.pk).isEqualTo("10")
            assertThat(response.status).isEqualTo("REJECTED")
            // Target must be unchanged after a rejection
            val tgtAfter = targetRow(10)
            assertThat(tgtAfter).isEqualTo(tgtBefore)
        }
    }
}
