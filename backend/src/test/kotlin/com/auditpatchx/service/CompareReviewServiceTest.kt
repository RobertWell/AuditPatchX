package com.auditpatchx.service

import com.auditpatchx.OracleTestResource
import com.auditpatchx.model.*
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder

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
        @DisplayName("Inserts source row into target with correct column values (INT, STR, CLOB)")
        fun testInsertsRowWithCorrectValues() {
            approveInsert("20")

            val src = sourceRow(20)
            val tgt = targetRow(20)

            assertThat(tgt["INT_VAL"]).isEqualTo(src["INT_VAL"])
            assertThat(tgt["STR_VAL"]).isEqualTo(src["STR_VAL"])
            assertThat(tgt["CLOB_VAL"]).isEqualTo(src["CLOB_VAL"])
        }

        @Test
        @DisplayName("INSERT copies all column types: NUMBER, DECIMAL, VARCHAR2, DATE, TIMESTAMP(6), CLOB — precision preserved")
        fun testInsertsAllColumnTypes() {
            approveInsert("21")

            val src = sourceRow(21)
            val tgt = targetRow(21)

            assertThat(tgt["INT_VAL"]).isEqualTo(src["INT_VAL"])       // NUMBER(10)
            assertThat(tgt["DEC_VAL"]).isEqualTo(src["DEC_VAL"])       // NUMBER(15,6)
            assertThat(tgt["STR_VAL"]).isEqualTo(src["STR_VAL"])       // VARCHAR2
            assertThat(tgt["DATE_VAL"]).isEqualTo(src["DATE_VAL"])     // DATE
            assertThat(tgt["TS_VAL"]).isEqualTo(src["TS_VAL"])         // TIMESTAMP(6)
            assertThat(tgt["CLOB_VAL"]).isEqualTo(src["CLOB_VAL"])     // CLOB
            assertThat(tgt["NULL_VAL"]).isEqualTo(src["NULL_VAL"])     // VARCHAR2 non-null
            // TIMESTAMP(6) sub-second precision must not be rounded on INSERT
            assertThat(tgt["TS_VAL"] as String).contains("09:00:00")
        }

        @Test
        @DisplayName("INSERT with NULL columns — NULLs propagated to target, not skipped")
        fun testInsertSparseRowPreservesNulls() {
            approveInsert("22")

            val tgt = targetRow(22)

            assertThat(tgt["STR_VAL"]).isEqualTo("sparse insert")
            assertThat(tgt["INT_VAL"]).isNull()
            assertThat(tgt["DEC_VAL"]).isNull()
            assertThat(tgt["DATE_VAL"]).isNull()
            assertThat(tgt["TS_VAL"]).isNull()
            assertThat(tgt["NULL_VAL"]).isNull()
        }

        @Test
        @DisplayName("INSERT with CLOB larger than 4000 chars — no truncation")
        fun testInsertLargeClobNotTruncated() {
            val largeClob = "y".repeat(6000)
            databaseService.update(
                UpdateRequest(
                    schema = "TESTUSER", table = "ALLTYPE_SOURCE",
                    pk = mapOf("ID" to 23),
                    set = mapOf("CLOB_VAL" to largeClob),
                    reason = "test setup"
                )
            )

            approveInsert("23")

            val tgtClob = targetRow(23)["CLOB_VAL"] as String
            assertThat(tgtClob).hasSize(6000)
            assertThat(tgtClob).isEqualTo(largeClob)
        }
    }

    @Nested
    @DisplayName("Ignored Columns")
    inner class IgnoredColumnTests {

        private val compareRequest = CompareJobRequest(
            tableOne = "TESTUSER.COMPARE_SOURCE",
            tableTwo = "TESTUSER.COMPARE_TARGET",
            syncPk = listOf("ID"),
            ignoreColumns = listOf("UPDATED_BY"),
            limit = 100
        )

        @Test
        @DisplayName("compare ignores configured columns but UPDATE approval still copies them")
        fun testIgnoredColumnExcludedFromDiffButCopiedOnUpdate() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.pk == "1" && it.status == "UPDATE" }

            assertThat(diff.changes.map { it.column }).doesNotContain("UPDATED_BY")

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = compareRequest.tableOne,
                    tableTwo = compareRequest.tableTwo,
                    rowStatus = diff.status,
                    syncPk = compareRequest.syncPk,
                    ignoreColumns = compareRequest.ignoreColumns,
                    pkMap = diff.pkMap
                )
            )

            val src = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPARE_SOURCE", mapOf("ID" to 1))
            ).row
            val tgt = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPARE_TARGET", mapOf("ID" to 1))
            ).row

            assertThat(tgt["UPDATED_BY"]).isEqualTo(src["UPDATED_BY"])
            assertThat(tgt["STATUS"]).isEqualTo(src["STATUS"])
            assertThat(tgt["DESCRIPTION"]).isEqualTo(src["DESCRIPTION"])
        }

        @Test
        @DisplayName("compare ignores configured columns but INSERT approval still copies them")
        fun testIgnoredColumnExcludedFromDiffButCopiedOnInsert() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.pk == "3" && it.status == "INSERT" }

            assertThat(diff.changes.map { it.column }).doesNotContain("UPDATED_BY")

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = compareRequest.tableOne,
                    tableTwo = compareRequest.tableTwo,
                    rowStatus = diff.status,
                    syncPk = compareRequest.syncPk,
                    ignoreColumns = compareRequest.ignoreColumns,
                    pkMap = diff.pkMap
                )
            )

            val src = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPARE_SOURCE", mapOf("ID" to 3))
            ).row
            val tgt = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPARE_TARGET", mapOf("ID" to 3))
            ).row

            assertThat(tgt["UPDATED_BY"]).isEqualTo(src["UPDATED_BY"])
            assertThat(tgt["STATUS"]).isEqualTo(src["STATUS"])
            assertThat(tgt["DESCRIPTION"]).isEqualTo(src["DESCRIPTION"])
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

    // -----------------------------------------------------------------------
    // Composite PK
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Composite PK (number + varchar2)")
    inner class CompositePkTests {

        @Test
        @DisplayName("UPDATE with composite PK copies all data columns")
        fun testApproveUpdateCompositePk() {
            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = "1-EAST",
                    status = "APPROVED",
                    tableOne = "TESTUSER.COMPOSITE_SOURCE",
                    tableTwo = "TESTUSER.COMPOSITE_TARGET",
                    rowStatus = "UPDATE",
                    syncPk = listOf("REGION_ID", "DEPT_CODE"),
                    ignoreColumns = emptyList(),
                    pkMap = mapOf("REGION_ID" to "1", "DEPT_CODE" to "EAST")
                )
            )

            val src = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPOSITE_SOURCE", mapOf("REGION_ID" to 1, "DEPT_CODE" to "EAST"))
            ).row
            val tgt = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPOSITE_TARGET", mapOf("REGION_ID" to 1, "DEPT_CODE" to "EAST"))
            ).row

            assertThat(tgt["VALUE"]).isEqualTo(src["VALUE"])
            assertThat(tgt["AMOUNT"]).isEqualTo(src["AMOUNT"])
        }

        @Test
        @DisplayName("INSERT with composite PK creates row in target")
        fun testApproveInsertCompositePk() {
            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = "2-WEST",
                    status = "APPROVED",
                    tableOne = "TESTUSER.COMPOSITE_SOURCE",
                    tableTwo = "TESTUSER.COMPOSITE_TARGET",
                    rowStatus = "INSERT",
                    syncPk = listOf("REGION_ID", "DEPT_CODE"),
                    ignoreColumns = emptyList(),
                    pkMap = mapOf("REGION_ID" to "2", "DEPT_CODE" to "WEST")
                )
            )

            val src = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPOSITE_SOURCE", mapOf("REGION_ID" to 2, "DEPT_CODE" to "WEST"))
            ).row
            val tgt = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "COMPOSITE_TARGET", mapOf("REGION_ID" to 2, "DEPT_CODE" to "WEST"))
            ).row

            assertThat(tgt["VALUE"]).isEqualTo(src["VALUE"])
            assertThat(tgt["AMOUNT"]).isEqualTo(src["AMOUNT"])
        }
    }

    // -----------------------------------------------------------------------
    // Composite PK containing TIMESTAMP(6)
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Composite PK with TIMESTAMP(6)")
    inner class TimestampPkTests {

        private val compareRequest = CompareJobRequest(
            tableOne = "TESTUSER.TSPK_SOURCE",
            tableTwo = "TESTUSER.TSPK_TARGET",
            syncPk = listOf("EVENT_ID", "EVENT_TS"),
            ignoreColumns = emptyList(),
            limit = 100
        )

        @Test
        @DisplayName("UPDATE with TIMESTAMP(6) PK column copies payload correctly")
        fun testApproveUpdateTimestampPk() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.status == "UPDATE" }

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = "TESTUSER.TSPK_SOURCE",
                    tableTwo = "TESTUSER.TSPK_TARGET",
                    rowStatus = "UPDATE",
                    syncPk = listOf("EVENT_ID", "EVENT_TS"),
                    ignoreColumns = emptyList(),
                    pkMap = diff.pkMap
                )
            )

            // After approval the row must no longer appear as a diff
            val diffsAfter = databaseService.compareTables(compareRequest).differences
            assertThat(diffsAfter.none { it.pk == diff.pk && it.status == "UPDATE" }).isTrue()
        }

        @Test
        @DisplayName("INSERT with TIMESTAMP(6) PK column creates row in target")
        fun testApproveInsertTimestampPk() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.status == "INSERT" }

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = "TESTUSER.TSPK_SOURCE",
                    tableTwo = "TESTUSER.TSPK_TARGET",
                    rowStatus = "INSERT",
                    syncPk = listOf("EVENT_ID", "EVENT_TS"),
                    ignoreColumns = emptyList(),
                    pkMap = diff.pkMap
                )
            )

            val diffsAfter = databaseService.compareTables(compareRequest).differences
            assertThat(diffsAfter.none { it.pk == diff.pk && it.status == "INSERT" }).isTrue()
        }
    }

    // -----------------------------------------------------------------------
    // Composite PK containing TIMESTAMP WITH TIME ZONE (UTC+1 and UTC+8)
    // -----------------------------------------------------------------------

    @Nested
    @Disabled("Oracle Free 23 normalises TIMESTAMP WITH TIME ZONE to UTC internally; " +
              "bind-back lookup by offset string finds no matching row. " +
              "These tests pass against Oracle Enterprise where TZ offsets are preserved.")
    @DisplayName("Composite PK with TIMESTAMP WITH TIME ZONE")
    @TestMethodOrder(MethodOrderer.OrderAnnotation::class)
    inner class TimezoneTimestampPkTests {

        private val compareRequest = CompareJobRequest(
            tableOne = "TESTUSER.TZPK_SOURCE",
            tableTwo = "TESTUSER.TZPK_TARGET",
            syncPk = listOf("EVENT_ID", "EVENT_TS"),
            ignoreColumns = emptyList(),
            limit = 100
        )

        @Test
        @Order(1)
        @DisplayName("compareTables preserves timezone offset in PK values")
        fun testDistinctTimezoneRowsAreDistinctDiffs() {
            val diffs = databaseService.compareTables(compareRequest).differences

            // Oracle Free does not allow TIMESTAMP WITH TIME ZONE as a physical PK, but
            // configured sync keys still need to preserve the offset value used for matching.
            val updatePks = diffs.filter { it.status == "UPDATE" }.map { it.pkMap["EVENT_ID"] }
            assertThat(updatePks).contains("2")

            // Timezone offset preserved in pkMap.
            val tsPks = diffs.filter { it.status == "UPDATE" }.map { it.pkMap["EVENT_TS"] }
            assertThat(tsPks.any { it!!.contains("+08:00") }).isTrue()
        }

        @Test
        @Order(2)
        @DisplayName("UPDATE with UTC+8 TIMESTAMP WITH TIME ZONE PK applies payload to target")
        fun testApproveUpdateUtcPlusEight() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.status == "UPDATE" && it.pkMap["EVENT_ID"] == "2" }

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = "TESTUSER.TZPK_SOURCE",
                    tableTwo = "TESTUSER.TZPK_TARGET",
                    rowStatus = "UPDATE",
                    syncPk = listOf("EVENT_ID", "EVENT_TS"),
                    ignoreColumns = emptyList(),
                    pkMap = diff.pkMap
                )
            )

            val diffsAfter = databaseService.compareTables(compareRequest).differences
            assertThat(diffsAfter.none { it.pkMap["EVENT_ID"] == "2" && it.status == "UPDATE" }).isTrue()
        }

        @Test
        @Order(3)
        @DisplayName("INSERT with UTC+8 TIMESTAMP WITH TIME ZONE PK creates row in target")
        fun testApproveInsertTimezoneRow() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.status == "INSERT" && it.pkMap["EVENT_ID"] == "3" }

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = "TESTUSER.TZPK_SOURCE",
                    tableTwo = "TESTUSER.TZPK_TARGET",
                    rowStatus = "INSERT",
                    syncPk = listOf("EVENT_ID", "EVENT_TS"),
                    ignoreColumns = emptyList(),
                    pkMap = diff.pkMap
                )
            )

            val diffsAfter = databaseService.compareTables(compareRequest).differences
            assertThat(diffsAfter.none { it.pkMap["EVENT_ID"] == "3" && it.status == "INSERT" }).isTrue()
        }
    }

    // -----------------------------------------------------------------------
    // Direction-sensitivity: compare integrity and approve correctness
    // -----------------------------------------------------------------------

    @Nested
    @DisplayName("Direction Sensitivity — A→B vs B→A")
    @TestMethodOrder(MethodOrderer.OrderAnnotation::class)
    inner class CompareDirectionTests {

        private val aToB = CompareJobRequest(
            tableOne = "TESTUSER.DIRECTION_A",
            tableTwo = "TESTUSER.DIRECTION_B",
            syncPk = listOf("ID"),
            ignoreColumns = emptyList(),
            limit = 100
        )

        private val bToA = CompareJobRequest(
            tableOne = "TESTUSER.DIRECTION_B",
            tableTwo = "TESTUSER.DIRECTION_A",
            syncPk = listOf("ID"),
            ignoreColumns = emptyList(),
            limit = 100
        )

        private fun rowA(id: Int) =
            databaseService.getByPk(GetByPkRequest("TESTUSER", "DIRECTION_A", mapOf("ID" to id))).row

        private fun rowB(id: Int) =
            databaseService.getByPk(GetByPkRequest("TESTUSER", "DIRECTION_B", mapOf("ID" to id))).row

        // --- 1. Frontend signal: direction is captured in compare request ---

        @Test
        @Order(1)
        @DisplayName("A→B request has tableOne=A tableTwo=B; B→A is the exact inverse")
        fun `compare request captures direction in tableOne and tableTwo`() {
            assertThat(aToB.tableOne).isEqualTo("TESTUSER.DIRECTION_A")
            assertThat(aToB.tableTwo).isEqualTo("TESTUSER.DIRECTION_B")
            assertThat(bToA.tableOne).isEqualTo("TESTUSER.DIRECTION_B")
            assertThat(bToA.tableTwo).isEqualTo("TESTUSER.DIRECTION_A")
            assertThat(aToB.tableOne).isEqualTo(bToA.tableTwo)
            assertThat(aToB.tableTwo).isEqualTo(bToA.tableOne)
        }

        // --- 2. Backend returns different result sets ---

        @Test
        @Order(2)
        @DisplayName("A→B and B→A produce different diff result sets")
        fun `switching direction produces different diffs`() {
            val atob = databaseService.compareTables(aToB).differences
            val btoa = databaseService.compareTables(bToA).differences

            val atobSignature = atob.map { it.pk to it.status }.toSet()
            val btoaSignature = btoa.map { it.pk to it.status }.toSet()

            assertThat(atobSignature).isNotEqualTo(btoaSignature)
        }

        @Test
        @Order(3)
        @DisplayName("A→B shows A-only row as INSERT and not the B-only row")
        fun `A to B shows only A-only rows as INSERT`() {
            val diffs = databaseService.compareTables(aToB).differences
            val insertPks = diffs.filter { it.status == "INSERT" }.map { it.pk }

            assertThat(insertPks).contains("10")   // ID=10 exists only in A → INSERT into B
            assertThat(insertPks).doesNotContain("20") // ID=20 only in B — not a source row
        }

        @Test
        @Order(4)
        @DisplayName("B→A shows B-only row as INSERT and not the A-only row")
        fun `B to A shows only B-only rows as INSERT`() {
            val diffs = databaseService.compareTables(bToA).differences
            val insertPks = diffs.filter { it.status == "INSERT" }.map { it.pk }

            assertThat(insertPks).contains("20")   // ID=20 exists only in B → INSERT into A
            assertThat(insertPks).doesNotContain("10") // ID=10 only in A — not a source row
        }

        @Test
        @Order(5)
        @DisplayName("Identical rows never appear in either direction")
        fun `identical rows are absent from both directions`() {
            val atob = databaseService.compareTables(aToB).differences
            val btoa = databaseService.compareTables(bToA).differences

            assertThat(atob.map { it.pk }).doesNotContain("2")
            assertThat(btoa.map { it.pk }).doesNotContain("2")
        }

        @Test
        @Order(6)
        @DisplayName("Shared-PK different-value row shows swapped sourceValue and targetValue by direction")
        fun `sourceValue and targetValue are swapped when direction is reversed`() {
            val atobChange = databaseService.compareTables(aToB).differences
                .first { it.pk == "1" && it.status == "UPDATE" }
                .changes.first { it.column == "VALUE" }

            val btoaChange = databaseService.compareTables(bToA).differences
                .first { it.pk == "1" && it.status == "UPDATE" }
                .changes.first { it.column == "VALUE" }

            // A→B: A is source, B is target
            assertThat(atobChange.sourceValue).isEqualTo("a-val-1")
            assertThat(atobChange.targetValue).isEqualTo("b-val-1")

            // B→A: B is source, A is target — values are exactly swapped
            assertThat(btoaChange.sourceValue).isEqualTo("b-val-1")
            assertThat(btoaChange.targetValue).isEqualTo("a-val-1")
        }

        // --- 3. Approve writes to the correct table ---

        @Test
        @Order(7)
        @DisplayName("A→B INSERT approval writes source row into B, leaves A unchanged")
        fun `A to B INSERT approval writes to B not A`() {
            databaseService.reviewCompareRow(CompareReviewRequest(
                pk = "10", status = "APPROVED",
                tableOne = "TESTUSER.DIRECTION_A", tableTwo = "TESTUSER.DIRECTION_B",
                rowStatus = "INSERT", syncPk = listOf("ID"), ignoreColumns = emptyList(),
                pkMap = mapOf("ID" to "10")
            ))

            assertThat(rowB(10)["VALUE"]).isEqualTo("a-only") // written to B
            assertThat(rowA(10)["VALUE"]).isEqualTo("a-only") // A unchanged
        }

        @Test
        @Order(8)
        @DisplayName("B→A INSERT approval writes source row into A, leaves B unchanged")
        fun `B to A INSERT approval writes to A not B`() {
            databaseService.reviewCompareRow(CompareReviewRequest(
                pk = "20", status = "APPROVED",
                tableOne = "TESTUSER.DIRECTION_B", tableTwo = "TESTUSER.DIRECTION_A",
                rowStatus = "INSERT", syncPk = listOf("ID"), ignoreColumns = emptyList(),
                pkMap = mapOf("ID" to "20")
            ))

            assertThat(rowA(20)["VALUE"]).isEqualTo("b-only") // written to A
            assertThat(rowB(20)["VALUE"]).isEqualTo("b-only") // B unchanged
        }

        @Test
        @Order(9)
        @DisplayName("A→B UPDATE approval overwrites B with A's values, leaves A unchanged")
        fun `A to B UPDATE approval applies A values to B`() {
            databaseService.reviewCompareRow(CompareReviewRequest(
                pk = "30", status = "APPROVED",
                tableOne = "TESTUSER.DIRECTION_A", tableTwo = "TESTUSER.DIRECTION_B",
                rowStatus = "UPDATE", syncPk = listOf("ID"), ignoreColumns = emptyList(),
                pkMap = mapOf("ID" to "30")
            ))

            assertThat(rowB(30)["VALUE"]).isEqualTo("a-val-30") // B now has A's value
            assertThat(rowA(30)["VALUE"]).isEqualTo("a-val-30") // A unchanged
        }

        @Test
        @Order(10)
        @DisplayName("B→A UPDATE approval overwrites A with B's values, leaves B unchanged")
        fun `B to A UPDATE approval applies B values to A`() {
            databaseService.reviewCompareRow(CompareReviewRequest(
                pk = "40", status = "APPROVED",
                tableOne = "TESTUSER.DIRECTION_B", tableTwo = "TESTUSER.DIRECTION_A",
                rowStatus = "UPDATE", syncPk = listOf("ID"), ignoreColumns = emptyList(),
                pkMap = mapOf("ID" to "40")
            ))

            assertThat(rowA(40)["VALUE"]).isEqualTo("b-val-40") // A now has B's value
            assertThat(rowB(40)["VALUE"]).isEqualTo("b-val-40") // B unchanged
        }

        @Test
        @Order(11)
        @DisplayName("A→B approve does not accidentally write to A (wrong direction guard)")
        fun `A to B approval never modifies the source table`() {
            val aBefore = rowA(30)["VALUE"]

            databaseService.reviewCompareRow(CompareReviewRequest(
                pk = "30", status = "APPROVED",
                tableOne = "TESTUSER.DIRECTION_A", tableTwo = "TESTUSER.DIRECTION_B",
                rowStatus = "UPDATE", syncPk = listOf("ID"), ignoreColumns = emptyList(),
                pkMap = mapOf("ID" to "30")
            ))

            // Source table A must be identical after the approval
            assertThat(rowA(30)["VALUE"]).isEqualTo(aBefore)
        }
    }

    // -----------------------------------------------------------------------
    // Numeric composite PK — NUMBER(10) + NUMBER(15,6)
    // Guards against ORA-01722 from BigDecimal binding and precision loss when
    // decimal PK values round-trip through JSON strings ("100.5" → BigDecimal
    // → Oracle bind → row lookup → JSON → "100.500000" → BigDecimal → bind).
    // -----------------------------------------------------------------------

    // Tests are ordered so detection runs before any approval mutates the seed data.
    @Nested
    @DisplayName("Numeric Composite PK — NUMBER + NUMBER(15,6)")
    @TestMethodOrder(MethodOrderer.OrderAnnotation::class)
    inner class NumericCompositePkTests {

        private val compareRequest = CompareJobRequest(
            tableOne = "TESTUSER.NUMPK_SOURCE",
            tableTwo = "TESTUSER.NUMPK_TARGET",
            syncPk = listOf("REGION_ID", "PRICE_SCALE"),
            ignoreColumns = emptyList(),
            limit = 100
        )

        private fun sourceRow(regionId: Number, priceScale: Number) =
            databaseService.getByPk(
                GetByPkRequest("TESTUSER", "NUMPK_SOURCE",
                    mapOf("REGION_ID" to regionId, "PRICE_SCALE" to priceScale))
            ).row

        private fun targetRow(regionId: Number, priceScale: Number) =
            databaseService.getByPk(
                GetByPkRequest("TESTUSER", "NUMPK_TARGET",
                    mapOf("REGION_ID" to regionId, "PRICE_SCALE" to priceScale))
            ).row

        @Test
        @Order(1)
        @DisplayName("compareTables detects UPDATE for numeric composite PK row (rows 1 and 4)")
        fun testCompareDetectsNumericPkDiff() {
            val diffs = databaseService.compareTables(compareRequest).differences
            val updates = diffs.filter { it.status == "UPDATE" }
            // Rows (1, 100.5) and (4, 100.5) both have different LABELs in source vs target
            assertThat(updates).hasSize(2)
            assertThat(updates.map { it.pkMap["REGION_ID"] }).containsExactlyInAnyOrder("1", "4")
        }

        @Test
        @Order(2)
        @DisplayName("compareTables detects INSERT rows (source-only) for numeric composite PK")
        fun testCompareDetectsNumericPkInserts() {
            val diffs = databaseService.compareTables(compareRequest).differences
            val inserts = diffs.filter { it.status == "INSERT" }
            // Rows 2 and 3 are source-only
            assertThat(inserts).hasSize(2)
            assertThat(inserts.map { it.pkMap["REGION_ID"] }).containsExactlyInAnyOrder("2", "3")
        }

        @Test
        @Order(3)
        @DisplayName("UPDATE of source-only row throws IllegalStateException — guard catches silent 0-row update")
        fun testUpdateSourceOnlyRowThrows() {
            // Row (2, 200.999999) exists in source but NOT in target.
            // Attempting an UPDATE (not INSERT) means the target WHERE clause matches nothing.
            // The service must throw rather than silently return "success" with 0 rows written.
            assertThatThrownBy {
                databaseService.reviewCompareRow(
                    CompareReviewRequest(
                        pk = "2-200.999999",
                        status = "APPROVED",
                        tableOne = "TESTUSER.NUMPK_SOURCE",
                        tableTwo = "TESTUSER.NUMPK_TARGET",
                        rowStatus = "UPDATE",
                        syncPk = listOf("REGION_ID", "PRICE_SCALE"),
                        ignoreColumns = emptyList(),
                        pkMap = mapOf("REGION_ID" to "2", "PRICE_SCALE" to "200.999999")
                    )
                )
            }.isInstanceOf(IllegalStateException::class.java)
                .hasMessageContaining("0 rows")
        }

        @Test
        @Order(4)
        @DisplayName("UPDATE with NUMBER(10)+NUMBER(15,6) PK — BigDecimal binding resolves row, LABEL copied")
        fun testApproveUpdateNumericCompositePk() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.status == "UPDATE" && it.pkMap["REGION_ID"] == "1" }

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = "TESTUSER.NUMPK_SOURCE",
                    tableTwo = "TESTUSER.NUMPK_TARGET",
                    rowStatus = "UPDATE",
                    syncPk = listOf("REGION_ID", "PRICE_SCALE"),
                    ignoreColumns = emptyList(),
                    pkMap = diff.pkMap
                )
            )

            val src = sourceRow(1, java.math.BigDecimal("100.5"))
            val tgt = targetRow(1, java.math.BigDecimal("100.5"))
            assertThat(tgt["LABEL"]).isEqualTo(src["LABEL"])
            assertThat(tgt["LABEL"]).isEqualTo("source label A")
        }

        @Test
        @Order(5)
        @DisplayName("UPDATE with trimmed decimal string '100.5' in pkMap — matches NUMBER(15,6) row (no ORA-01722, no silent no-op)")
        fun testApproveUpdateTrimmedDecimalPkString() {
            // Row 4: source='trimmed source label', target='trimmed old label' — clean before/after.
            // Manually construct pkMap with the short decimal form ("100.5" not "100.500000")
            // to verify convertValueForBinding handles trailing-zero-stripped values correctly.
            val tgtBefore = targetRow(4, java.math.BigDecimal("100.5"))
            assertThat(tgtBefore["LABEL"]).isEqualTo("trimmed old label")

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = "4-100.5",
                    status = "APPROVED",
                    tableOne = "TESTUSER.NUMPK_SOURCE",
                    tableTwo = "TESTUSER.NUMPK_TARGET",
                    rowStatus = "UPDATE",
                    syncPk = listOf("REGION_ID", "PRICE_SCALE"),
                    ignoreColumns = emptyList(),
                    pkMap = mapOf("REGION_ID" to "4", "PRICE_SCALE" to "100.5")
                )
            )

            val tgt = targetRow(4, java.math.BigDecimal("100.5"))
            assertThat(tgt["LABEL"]).isEqualTo("trimmed source label")
        }

        @Test
        @Order(6)
        @DisplayName("INSERT (REGION_ID=2, PRICE_SCALE=200.999999) — NUMBER(15,6) PK precision survives round-trip")
        fun testApproveInsertHighPrecisionDecimalPk() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.status == "INSERT" && it.pkMap["REGION_ID"] == "2" }

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = "TESTUSER.NUMPK_SOURCE",
                    tableTwo = "TESTUSER.NUMPK_TARGET",
                    rowStatus = "INSERT",
                    syncPk = listOf("REGION_ID", "PRICE_SCALE"),
                    ignoreColumns = emptyList(),
                    pkMap = diff.pkMap
                )
            )

            val tgt = targetRow(2, java.math.BigDecimal("200.999999"))
            assertThat(tgt["LABEL"]).isEqualTo("source label B")

            // Row now synced — must not appear as INSERT again
            val diffsAfter = databaseService.compareTables(compareRequest).differences
            assertThat(diffsAfter.none { it.pkMap["REGION_ID"] == "2" && it.status == "INSERT" }).isTrue()
        }

        @Test
        @Order(7)
        @DisplayName("INSERT (REGION_ID=3, PRICE_SCALE=0.000001) — minimum-scale NUMBER(15,6) PK binds correctly")
        fun testApproveInsertMinScaleDecimalPk() {
            val diff = databaseService.compareTables(compareRequest)
                .differences.first { it.status == "INSERT" && it.pkMap["REGION_ID"] == "3" }

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = diff.pk,
                    status = "APPROVED",
                    tableOne = "TESTUSER.NUMPK_SOURCE",
                    tableTwo = "TESTUSER.NUMPK_TARGET",
                    rowStatus = "INSERT",
                    syncPk = listOf("REGION_ID", "PRICE_SCALE"),
                    ignoreColumns = emptyList(),
                    pkMap = diff.pkMap
                )
            )

            val tgt = targetRow(3, java.math.BigDecimal("0.000001"))
            assertThat(tgt["LABEL"]).isEqualTo("min scale label")
        }

        @Test
        @Order(8)
        @DisplayName("REJECTED decision on numeric PK row leaves target unchanged")
        fun testRejectNumericPkRowLeavesTargetUnchanged() {
            // Row 1 was synced in Order(4). REJECTED must not modify it again.
            val tgtBefore = targetRow(1, java.math.BigDecimal("100.5"))

            databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = "1-100.5",
                    status = "REJECTED",
                    tableOne = "TESTUSER.NUMPK_SOURCE",
                    tableTwo = "TESTUSER.NUMPK_TARGET",
                    rowStatus = "UPDATE",
                    syncPk = listOf("REGION_ID", "PRICE_SCALE"),
                    ignoreColumns = emptyList(),
                    pkMap = mapOf("REGION_ID" to "1", "PRICE_SCALE" to "100.5")
                )
            )

            val tgtAfter = targetRow(1, java.math.BigDecimal("100.5"))
            assertThat(tgtAfter["LABEL"]).isEqualTo(tgtBefore["LABEL"])
        }
    }

    /**
     * HEL-238 §5 (streaming / bounded): compareTables now reads the source set
     * through PkgroveKit's streaming `JdbiReader.read` / `JdbiRowStream` instead
     * of materializing it with `readAll(...).rows.map(...)`. These tests lock the
     * scan-accounting parity of that refactor — `scannedRows` / `limitReached`
     * are computed from the stream cursor now, and must still match the old
     * list-size semantics exactly. (Row content / diff parity is covered by the
     * INSERT / UPDATE / ignored-column / CLOB matrices above.)
     */
    @Nested
    @DisplayName("HEL-238 streaming/bounded compare — scan accounting parity")
    inner class StreamingBoundedCompareTests {

        private fun compare(limit: Int) = databaseService.compareTables(
            CompareJobRequest(
                tableOne = "TESTUSER.COMPARE_SOURCE",
                tableTwo = "TESTUSER.COMPARE_TARGET",
                syncPk = listOf("ID"),
                ignoreColumns = emptyList(),
                limit = limit
            )
        )

        @Test
        @DisplayName("streams every source row when under the limit — scannedRows counts all, limitReached false")
        fun testStreamsAllSourceRowsUnderLimit() {
            // COMPARE_SOURCE seeds 9 rows (IDs 1..9); a limit above that scans them all.
            val result = compare(limit = 100)

            assertThat(result.scannedRows).isEqualTo(9)
            assertThat(result.limitReached).isFalse()
        }

        @Test
        @DisplayName("bounds the streamed scan at the limit — scannedRows == limit, limitReached true")
        fun testBoundsStreamedScanAtLimit() {
            val result = compare(limit = 2)

            assertThat(result.scannedRows).isEqualTo(2)
            assertThat(result.limitReached).isTrue()
        }
    }
}
