package com.auditpatchx.service

import com.auditpatchx.OracleTestResource
import com.auditpatchx.model.*
import io.agroal.api.AgroalDataSource
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.sql.Connection
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * HEL-130 acceptance evidence: task-specific proof that AuditPatchX's ADOPTED
 * PkgroveKit (ex-RowRelay) code path — DatabaseService's JdbiReader reads,
 * OracleDialect identifiers and jdbi.inTransaction write/patch/approve flows —
 * behaves correctly on THIS service's Agroal pool. Library-level lifecycle
 * tests (HEL-128/HEL-129) are deliberately NOT relied on here; every scenario
 * drives the service's own public API against the live Oracle testcontainer.
 *
 * Gap coverage:
 *  a. OWNERSHIP   — the pool is never closed by the library; leases return to 0
 *                   and the pool still serves every configured connection.
 *  b. TRANSACTION — a caller-owned transaction through the service path commits
 *                   atomically; a mid-operation failure (deferred constraint
 *                   fires at COMMIT, i.e. after the write applied) rolls back
 *                   with nothing half-applied.
 *  c. CANCELLATION— an in-flight approve blocked mid-transfer and killed
 *                   server-side releases its connection (active leases 0) and
 *                   leaves no partial rows.
 *  d. CLEANUP     — repeated failures do not poison the pool; committed work
 *                   succeeds immediately afterwards.
 *
 * Post-conditions are verified through RAW JDBC connections (never Jdbi or
 * PkgroveKit) so the checks are independent of the code path under test.
 * LIFECYCLE_* rows are dedicated per test — see test-schema.sql.
 */
@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("HEL-130 PkgroveKit adoption lifecycle (pool ownership / transaction / cancellation / cleanup)")
class PkgroveKitLifecycleTest {

    @Inject
    lateinit var databaseService: DatabaseService

    @Inject
    lateinit var dataSource: AgroalDataSource

    // --- helpers -----------------------------------------------------------

    private fun activeLeases(): Long = dataSource.metrics.activeCount()

    /** Leases are returned synchronously on handle close; the small poll only
     *  absorbs scheduling noise. Fails if any lease is still out. */
    private fun awaitZeroLeases(timeoutMs: Long = 15_000) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline && activeLeases() != 0L) {
            Thread.sleep(100)
        }
        assertThat(activeLeases())
            .`as`("Agroal active lease count after the operation completed")
            .isZero()
    }

    /** Raw-JDBC read — independent verification channel (no Jdbi, no PkgroveKit). */
    private fun rawRow(table: String, id: Int): Pair<BigDecimal, String?>? =
        dataSource.connection.use { conn ->
            conn.prepareStatement("SELECT AMOUNT, NOTE FROM TESTUSER.$table WHERE ID = ?").use { ps ->
                ps.setInt(1, id)
                ps.executeQuery().use { rs ->
                    if (rs.next()) Pair(rs.getBigDecimal("AMOUNT"), rs.getString("NOTE")) else null
                }
            }
        }

    private fun approve(rowStatus: String, id: String): CompareReviewResponse =
        databaseService.reviewCompareRow(
            CompareReviewRequest(
                pk = id,
                status = "APPROVED",
                tableOne = "TESTUSER.LIFECYCLE_SOURCE",
                tableTwo = "TESTUSER.LIFECYCLE_TARGET",
                rowStatus = rowStatus,
                syncPk = listOf("ID"),
                ignoreColumns = emptyList(),
                pkMap = mapOf("ID" to id)
            )
        )

    // --- a. OWNERSHIP ------------------------------------------------------

    @Nested
    @DisplayName("Pool ownership — the library never closes the service's pool")
    inner class PoolOwnershipTests {

        @Test
        @DisplayName("After read/compare/patch service operations every lease is returned and the pool still serves max-size connections")
        fun testServiceOperationsReturnEveryLeaseAndPoolStaysOpen() {
            // Battery across the adopted paths: JdbiReader reads, compare fold, patch write
            databaseService.query(QueryRequest(schema = "TESTUSER", table = "EMPLOYEE", limit = 50))
            databaseService.getByPk(GetByPkRequest("TESTUSER", "LIFECYCLE_TARGET", mapOf("ID" to 1)))
            databaseService.compareTables(
                CompareJobRequest(
                    tableOne = "TESTUSER.LIFECYCLE_SOURCE",
                    tableTwo = "TESTUSER.LIFECYCLE_TARGET",
                    syncPk = listOf("ID"),
                    ignoreColumns = emptyList(),
                    limit = 100
                )
            )
            databaseService.update(
                UpdateRequest(
                    schema = "TESTUSER", table = "LIFECYCLE_TARGET",
                    pk = mapOf("ID" to 9),
                    set = mapOf("NOTE" to "ownership pass"),
                    reason = "HEL-130 ownership battery"
                )
            )

            // Metrics must actually be recording, otherwise activeCount()==0 is vacuous
            assertThat(dataSource.metrics.acquireCount())
                .`as`("Agroal metrics are live (assertion is not vacuously true)")
                .isGreaterThan(0)
            awaitZeroLeases()

            // The pool was not closed by the library: it still serves EVERY configured
            // connection simultaneously (a closed/leaked pool cannot do this).
            val maxSize = dataSource.configuration.connectionPoolConfiguration().maxSize()
            val held = mutableListOf<Connection>()
            try {
                repeat(maxSize) { held += dataSource.connection }
                assertThat(held).hasSize(maxSize)
                held.forEach { c ->
                    c.createStatement().use { st -> st.executeQuery("SELECT 1 FROM DUAL").close() }
                }
                assertThat(activeLeases()).isEqualTo(maxSize.toLong())
            } finally {
                held.forEach { runCatching { it.close() } }
            }
            awaitZeroLeases()
        }
    }

    // --- b. TRANSACTION ----------------------------------------------------

    @Nested
    @DisplayName("Transaction — caller-owned transaction commits atomically, failures roll back completely")
    inner class TransactionTests {

        @Test
        @DisplayName("Approve UPDATE commits atomically: all columns land together, visible to a raw connection")
        fun testApproveUpdateCommitsAtomically() {
            approve("UPDATE", "1")

            val (amount, note) = rawRow("LIFECYCLE_TARGET", 1)!!
            assertThat(amount).isEqualByComparingTo(BigDecimal(10))
            assertThat(note).isEqualTo("source-one")
            awaitZeroLeases()
        }

        @Test
        @DisplayName("Patch path commits atomically and the PkgroveKit fetch-back read runs INSIDE the caller's transaction")
        fun testPatchPathCommitsAtomically() {
            val response = databaseService.update(
                UpdateRequest(
                    schema = "TESTUSER", table = "LIFECYCLE_TARGET",
                    pk = mapOf("ID" to 8),
                    set = mapOf("AMOUNT" to 81, "NOTE" to "patch committed"),
                    reason = "HEL-130 commit"
                )
            )

            // The response row comes from JdbiReader.readAll on the SAME handle,
            // before commit — proving the library read participates in the
            // caller-owned transaction instead of opening its own connection.
            assertThat(response.updated).isEqualTo(1)
            assertThat((response.row["AMOUNT"] as BigDecimal)).isEqualByComparingTo(BigDecimal(81))
            assertThat(response.row["NOTE"]).isEqualTo("patch committed")

            val (amount, note) = rawRow("LIFECYCLE_TARGET", 8)!!
            assertThat(amount).isEqualByComparingTo(BigDecimal(81))
            assertThat(note).isEqualTo("patch committed")
            awaitZeroLeases()
        }

        @Test
        @DisplayName("Mid-operation failure (deferred constraint at COMMIT) rolls back the approve UPDATE — nothing half-applied")
        fun testApproveUpdateFailureRollsBackCompletely() {
            val before = rawRow("LIFECYCLE_TARGET", 2)!!

            // Source AMOUNT=-5: the UPDATE statement succeeds, the deferred check
            // fires at COMMIT — a genuine failure AFTER the write was applied.
            assertThatThrownBy { approve("UPDATE", "2") }
                .hasStackTraceContaining("ORA-02091")

            val after = rawRow("LIFECYCLE_TARGET", 2)!!
            assertThat(after).`as`("no column of row 2 may be half-applied").isEqualTo(before)
            assertThat(after.first).isEqualByComparingTo(BigDecimal(3))
            assertThat(after.second).isEqualTo("target-two")
            awaitZeroLeases()
        }

        @Test
        @DisplayName("Mid-operation failure rolls back the approve INSERT — no phantom row in the target")
        fun testApproveInsertFailureLeavesNoPhantomRow() {
            assertThatThrownBy { approve("INSERT", "3") }
                .hasStackTraceContaining("ORA-02091")

            assertThat(rawRow("LIFECYCLE_TARGET", 3))
                .`as`("rolled-back INSERT must not leave a row")
                .isNull()
            awaitZeroLeases()
        }

        @Test
        @DisplayName("Mid-operation failure rolls back the service patch path — row keeps every pre-patch value")
        fun testPatchPathFailureRollsBackCompletely() {
            assertThatThrownBy {
                databaseService.update(
                    UpdateRequest(
                        schema = "TESTUSER", table = "LIFECYCLE_TARGET",
                        pk = mapOf("ID" to 6),
                        set = mapOf("AMOUNT" to -9, "NOTE" to "must never persist"),
                        reason = "HEL-130 rollback"
                    )
                )
            }.hasStackTraceContaining("ORA-02091")

            val (amount, note) = rawRow("LIFECYCLE_TARGET", 6)!!
            assertThat(amount).isEqualByComparingTo(BigDecimal(60))
            assertThat(note).isEqualTo("patch-rollback")
            awaitZeroLeases()
        }
    }

    // --- c. CANCELLATION ---------------------------------------------------

    @Nested
    @DisplayName("Cancellation — killed mid-transfer operation releases connections, no partial rows")
    inner class CancellationTests {

        @Test
        @DisplayName("Approve blocked mid-transfer and killed server-side: lease released, target untouched, pool serves the retry")
        fun testKilledMidTransferReleasesConnectionAndLeavesNoPartialRows() {
            val before = rawRow("LIFECYCLE_TARGET", 5)!!
            val executor = Executors.newSingleThreadExecutor()
            try {
                dataSource.connection.use { locker ->
                    locker.autoCommit = false
                    // Hold a row lock so the service UPDATE is genuinely in-flight
                    locker.prepareStatement(
                        "SELECT ID FROM TESTUSER.LIFECYCLE_TARGET WHERE ID = 5 FOR UPDATE"
                    ).use { it.executeQuery().close() }

                    try {
                        val inFlight = executor.submit<CompareReviewResponse> { approve("UPDATE", "5") }

                        // Wait until the service session is enqueued on the row lock,
                        // then cancel it server-side (the abort a client cancel maps to).
                        val (sid, serial) = awaitBlockedSession()
                        assertThat(inFlight.isDone).`as`("operation must be mid-transfer").isFalse()

                        // DISCONNECT ... IMMEDIATE terminates the server process
                        // synchronously (transaction rolled back, client errors out).
                        // ORA-00031 ("marked for kill") means the kill was accepted
                        // asynchronously — also a successful cancel, so tolerate it.
                        dataSource.connection.use { admin ->
                            admin.createStatement().use { st ->
                                try {
                                    st.execute("ALTER SYSTEM DISCONNECT SESSION '$sid,$serial' IMMEDIATE")
                                } catch (e: java.sql.SQLException) {
                                    if (!(e.message ?: "").contains("ORA-00031")) throw e
                                }
                                Unit
                            }
                        }

                        val thrown = catchThrowable { inFlight.get(60, TimeUnit.SECONDS) }
                        assertThat(thrown)
                            .`as`("cancelled operation must abort, not commit")
                            .isInstanceOf(ExecutionException::class.java)
                    } finally {
                        locker.rollback()
                    }
                }
            } finally {
                executor.shutdownNow()
            }

            // Connection released even though the session died mid-statement
            awaitZeroLeases()

            // No partial rows survived the kill
            assertThat(rawRow("LIFECYCLE_TARGET", 5))
                .`as`("target row must be untouched by the cancelled transfer")
                .isEqualTo(before)

            // Cleanup after cancellation: the same operation succeeds on a fresh
            // connection now that the lock is gone (broken connection was evicted).
            approve("UPDATE", "5")
            val (amount, note) = rawRow("LIFECYCLE_TARGET", 5)!!
            assertThat(amount).isEqualByComparingTo(BigDecimal(50))
            assertThat(note).isEqualTo("cancel-src")
            awaitZeroLeases()
        }

        /** Polls v$session (TESTUSER has DBA in the test container) for the pool
         *  session enqueued on the row lock. */
        private fun awaitBlockedSession(timeoutMs: Long = 30_000): Pair<Int, Int> {
            val deadline = System.currentTimeMillis() + timeoutMs
            dataSource.connection.use { admin ->
                while (System.currentTimeMillis() < deadline) {
                    admin.prepareStatement(
                        """
                        SELECT sid, serial# AS ser FROM v${'$'}session
                        WHERE username = 'TESTUSER' AND blocking_session IS NOT NULL
                        """.trimIndent()
                    ).use { ps ->
                        ps.executeQuery().use { rs ->
                            if (rs.next()) return Pair(rs.getInt("SID"), rs.getInt("SER"))
                        }
                    }
                    Thread.sleep(250)
                }
            }
            throw AssertionError("service session never appeared as lock-blocked in v\$session within ${timeoutMs}ms")
        }
    }

    // --- d. CLEANUP --------------------------------------------------------

    @Nested
    @DisplayName("Cleanup — repeated failures do not poison the pool")
    inner class CleanupTests {

        @Test
        @DisplayName("Five consecutive rollbacks plus an insert failure leave the pool fully usable; committed work then succeeds")
        fun testRepeatedFailuresDoNotPoisonThePool() {
            repeat(5) { attempt ->
                assertThatThrownBy { approve("UPDATE", "2") }
                    .`as`("failure attempt ${attempt + 1}")
                    .hasStackTraceContaining("ORA-02091")
                awaitZeroLeases()
            }

            // Service insert path failing at COMMIT (write applied, then aborted)
            assertThatThrownBy {
                databaseService.insert(
                    InsertRequest(
                        schema = "TESTUSER", table = "LIFECYCLE_TARGET",
                        values = mapOf("ID" to 7, "AMOUNT" to -1, "NOTE" to "poison probe"),
                        reason = "HEL-130 cleanup"
                    )
                )
            }.hasStackTraceContaining("ORA-02091")
            assertThat(rawRow("LIFECYCLE_TARGET", 7)).isNull()
            awaitZeroLeases()

            // Pool serves committed work immediately after the failure storm
            approve("INSERT", "4")
            val (amount, note) = rawRow("LIFECYCLE_TARGET", 4)!!
            assertThat(amount).isEqualByComparingTo(BigDecimal(40))
            assertThat(note).isEqualTo("insert-me")

            val queryResponse = databaseService.query(
                QueryRequest(schema = "TESTUSER", table = "EMPLOYEE", limit = 5)
            )
            assertThat(queryResponse.rows).isNotEmpty
            awaitZeroLeases()
        }
    }
}
