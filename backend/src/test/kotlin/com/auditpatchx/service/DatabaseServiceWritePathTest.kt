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
import java.math.BigDecimal

/**
 * Service-level coverage of the write helpers DatabaseServiceTest leaves out:
 * insert (filtering, PK read-back, rollback), CLOB NULL/empty updates, the
 * temporal-string parsers behind DATE binding, TIMESTAMP WITH TIME ZONE
 * round-trips, and the review no-op when the two tables share only the PK.
 *
 * Fixture ownership: DEPARTMENT id 110, JOB_HISTORY (3, 2021-06-10).END_DATE,
 * EMPLOYEE 4.BIO. Nothing else reads them.
 */
@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("DatabaseService write-path and binding edge cases")
class DatabaseServiceWritePathTest {

    @Inject
    lateinit var databaseService: DatabaseService

    @Nested
    @DisplayName("Insert")
    inner class InsertTests {

        @Test
        @DisplayName("Inserts, converts string numbers per column type, and reads the row back by PK")
        fun testInsertReadsBackByPk() {
            val response = databaseService.insert(
                InsertRequest(
                    schema = "TESTUSER",
                    table = "DEPARTMENT",
                    values = mapOf("DEPT_ID" to "110", "DEPT_NAME" to "Research", "BUDGET" to "12345.67"),
                    reason = "service insert"
                )
            )

            assertThat(response.inserted).isEqualTo(1)
            assertThat(response.row["DEPT_ID"]).isEqualTo(BigDecimal.valueOf(110))
            assertThat(response.row["DEPT_NAME"]).isEqualTo("Research")
            assertThat(response.row["BUDGET"] as BigDecimal).isEqualByComparingTo("12345.67")
            assertThat(response.row["LOCATION"]).isNull()
        }

        @Test
        @DisplayName("Rejects a request with no non-blank value before touching the database")
        fun testInsertNoValues() {
            assertThatThrownBy {
                databaseService.insert(
                    InsertRequest(
                        schema = "TESTUSER",
                        table = "DEPARTMENT",
                        values = mapOf("DEPT_NAME" to " ", "LOCATION" to null),
                        reason = "nothing"
                    )
                )
            }
                .isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("No values provided")
        }

        @Test
        @DisplayName("Rejects columns outside the table and tables outside the allowlist")
        fun testInsertSecurity() {
            assertThatThrownBy {
                databaseService.insert(
                    InsertRequest("TESTUSER", "DEPARTMENT", mapOf("DEPT_ID" to 111, "NOPE" to "x"), "bad column")
                )
            }.isInstanceOf(SecurityException::class.java).hasMessageContaining("NOPE")

            assertThatThrownBy {
                databaseService.insert(
                    InsertRequest("TESTUSER", "SPARSE_PK_TARGET", mapOf("ID" to 5), "not allowlisted")
                )
            }.isInstanceOf(SecurityException::class.java).hasMessageContaining("not in allowlist")
        }

        @Test
        @DisplayName("A missing configured PK value fails after the INSERT and the transaction rolls back")
        fun testInsertMissingPkRollsBack() {
            fun payloads() = databaseService.query(
                QueryRequest(schema = "TESTUSER", table = "TZPK_SOURCE", limit = 50)
            ).rows.map { it["PAYLOAD"] }

            val before = payloads()

            assertThatThrownBy {
                databaseService.insert(
                    InsertRequest("TESTUSER", "TZPK_SOURCE", mapOf("PAYLOAD" to "svc no pk"), "rollback")
                )
            }
                .isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("PK column EVENT_ID must be provided")

            assertThat(payloads()).containsExactlyInAnyOrderElementsOf(before)
            assertThat(payloads()).doesNotContain("svc no pk")
        }
    }

    @Nested
    @DisplayName("CLOB updates")
    inner class ClobUpdateTests {

        private fun setBio(value: String?) = databaseService.update(
            UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 4),
                set = mapOf("BIO" to value),
                reason = "clob edge case"
            )
        )

        @Test
        @DisplayName("null clears a CLOB column")
        fun testNullClearsClob() {
            setBio("seed before null")
            val response = setBio(null)

            assertThat(response.updated).isEqualTo(1)
            assertThat(response.row["BIO"]).isNull()
        }

        @Test
        @DisplayName("An empty string writes TO_CLOB(''), which Oracle stores as NULL")
        fun testEmptyStringClob() {
            setBio("seed before empty")
            val response = setBio("")

            assertThat(response.updated).isEqualTo(1)
            assertThat(response.row["BIO"]).isNull()
        }
    }

    @Nested
    @DisplayName("Temporal string binding against a DATE column")
    inner class TemporalBindingTests {

        private val pk = mapOf("EMPLOYEE_ID" to 3, "START_DATE" to "2021-06-10")

        private fun endDate() = databaseService.getByPk(
            GetByPkRequest("TESTUSER", "JOB_HISTORY", pk)
        ).row["END_DATE"]

        private fun setEndDate(value: Any?) = databaseService.update(
            UpdateRequest(
                schema = "TESTUSER",
                table = "JOB_HISTORY",
                pk = pk,
                set = mapOf("END_DATE" to value),
                reason = "temporal binding"
            )
        ).row["END_DATE"]

        @Test
        @DisplayName("yyyy-MM-dd HH:mm:ss binds the wall-clock time")
        fun testSpaceSeparatedDateTime() {
            assertThat(setEndDate("2021-12-31 08:15:30")).isEqualTo("2021-12-31T08:15:30")
        }

        @Test
        @DisplayName("A zoned ISO date-time binds by its local wall-clock")
        fun testZonedDateTime() {
            assertThat(setEndDate("2022-01-02T03:04:05+05:00[Asia/Karachi]")).isEqualTo("2022-01-02T03:04:05")
        }

        @Test
        @DisplayName("An offset ISO date-time binds by its local wall-clock (offset dropped for DATE)")
        fun testOffsetDateTime() {
            assertThat(setEndDate("2022-02-03T04:05:06+02:00")).isEqualTo("2022-02-03T04:05:06")
        }

        @Test
        @DisplayName("Unparseable text is bound verbatim, Oracle rejects it, and the row is untouched")
        fun testUnparseableText() {
            setEndDate("2022-03-04T05:06:07")
            val before = endDate()

            assertThatThrownBy { setEndDate("next week") }
                .isNotInstanceOf(SecurityException::class.java)
                .isNotInstanceOf(IllegalArgumentException::class.java)

            assertThat(endDate()).isEqualTo(before)
        }
    }

    @Nested
    @DisplayName("TIMESTAMP WITH TIME ZONE")
    inner class TimeZoneTests {

        @Test
        @DisplayName("An offset date-time filter binds against a TIMESTAMP WITH TIME ZONE column and values read back as ISO offset strings")
        fun testOffsetFilterAndReadBack() {
            val response = databaseService.query(
                QueryRequest(
                    schema = "TESTUSER",
                    table = "TZPK_SOURCE",
                    filters = listOf(FilterCondition("EVENT_TS", "gte", "2023-01-01T00:00:00+00:00")),
                    limit = 50
                )
            )

            assertThat(response.rows).hasSize(3)
            response.rows.forEach { row ->
                assertThat(row["EVENT_TS"]).isInstanceOf(String::class.java)
                assertThat(row["EVENT_TS"] as String).startsWith("2023-06-1")
            }
        }

        @Test
        @DisplayName("A TIMESTAMP WITH TIME ZONE PK bound from an offset string matches by instant")
        fun testOffsetStringPkLookup() {
            // Row 2 is 10:30 at +08:00 (02:30Z); row 1 is 10:30 at +01:00 (09:30Z).
            fun lookup(eventTs: String) = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "TZPK_SOURCE", mapOf("EVENT_ID" to 2, "EVENT_TS" to eventTs))
            ).row["PAYLOAD"]

            assertThat(lookup("2023-06-15T10:30:00+08:00")).isEqualTo("utc8 source payload")
            // The same instant written in another offset still matches...
            assertThat(lookup("2023-06-15T02:30:00Z")).isEqualTo("utc8 source payload")
            // ...while the same wall-clock at a different offset is a different instant.
            assertThatThrownBy { lookup("2023-06-15T10:30:00+01:00") }
                .isInstanceOf(NotFoundException::class.java)
        }

        @Test
        @DisplayName("Metadata reports the time-zone column type")
        fun testMetadataType() {
            val eventTs = databaseService.getTableMetadata("TESTUSER", "TZPK_SOURCE")
                .columns.first { it.name == "EVENT_TS" }

            println("TZPK_SOURCE.EVENT_TS jdbc type name = '${eventTs.type}'")
            assertThat(eventTs.type).containsIgnoringCase("TIME ZONE")
        }
    }

    @Nested
    @DisplayName("Review edge cases")
    inner class ReviewEdgeCaseTests {

        @Test
        @DisplayName("APPROVED UPDATE between tables that share only the PK is a no-op")
        fun testUpdateWithNoSharedDataColumns() {
            // LIFECYCLE_SOURCE(ID, AMOUNT, NOTE) vs DIRECTION_B(ID, VALUE): only ID overlaps.
            fun targetRow() = databaseService.getByPk(
                GetByPkRequest("TESTUSER", "DIRECTION_B", mapOf("ID" to 1))
            ).row

            val before = targetRow()

            val response = databaseService.reviewCompareRow(
                CompareReviewRequest(
                    pk = "1",
                    status = "APPROVED",
                    tableOne = "TESTUSER.LIFECYCLE_SOURCE",
                    tableTwo = "TESTUSER.DIRECTION_B",
                    rowStatus = "UPDATE",
                    syncPk = listOf("ID"),
                    ignoreColumns = emptyList(),
                    pkMap = mapOf("ID" to "1")
                )
            )

            assertThat(response.status).isEqualTo("APPROVED")
            assertThat(targetRow()).isEqualTo(before)
        }
    }
}
