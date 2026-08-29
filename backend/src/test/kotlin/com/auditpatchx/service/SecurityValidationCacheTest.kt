package com.auditpatchx.service

import com.auditpatchx.config.AllowlistService
import com.auditpatchx.config.TableAllowlistConfig
import com.auditpatchx.config.TableConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.DatabaseMetaData
import java.sql.ResultSet
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource

/**
 * HEL-304: the column-metadata cache lives in an @ApplicationScoped singleton
 * hit concurrently on the request hot path. These tests race parallel
 * first-touch lookups against a stubbed DB layer (JDK dynamic proxies — repo
 * convention is hand-rolled test doubles, no mocking library) and verify the
 * TTL-bounded expiry via the injectable time source.
 */
@DisplayName("SecurityValidationService cache concurrency (HEL-304)")
class SecurityValidationCacheTest {

    private val columnNames = listOf("EMP_ID", "FIRST_NAME", "LAST_NAME", "SALARY")

    @Test
    @DisplayName("Parallel first-touch on the same table is safe and converges on one cached entry")
    fun testParallelFirstTouchOnSameTable() {
        val fetchCount = AtomicInteger(0)
        val service = newService(fetchCount, fetchLatencyMs = 20)

        val threads = 16
        val barrier = CyclicBarrier(threads)
        val executor = Executors.newFixedThreadPool(threads)
        try {
            val futures = (1..threads).map {
                executor.submit(Callable {
                    barrier.await(5, TimeUnit.SECONDS)
                    service.validateAndGetColumns("TESTUSER", "EMPLOYEE")
                })
            }
            // Any exception in a worker (corruption, SecurityException, CME)
            // rethrows here and fails the test.
            val results = futures.map { it.get(30, TimeUnit.SECONDS) }

            // Every thread sees the full, correct column set.
            results.forEach { assertThat(it).containsExactlyInAnyOrderElementsOf(columnNames) }

            // All racers converge on the single instance that won the
            // putIfAbsent race — no thread keeps a private orphaned copy.
            assertThat(results.map { System.identityHashCode(it) }.distinct()).hasSize(1)

            // The DB fetch happens outside the map lock by design, so the race
            // may fetch more than once — but never more than once per thread.
            val fetchesDuringRace = fetchCount.get()
            assertThat(fetchesDuringRace).isBetween(1, threads)

            // Post-race, the cache must serve without another DB fetch.
            assertThat(service.validateAndGetColumns("TESTUSER", "EMPLOYEE"))
                .containsExactlyInAnyOrderElementsOf(columnNames)
            assertThat(fetchCount.get()).isEqualTo(fetchesDuringRace)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    @DisplayName("An entry stays cached indefinitely — restart/redeploy is the refresh boundary")
    fun testEntriesArePermanentUntilCleared() {
        // HEL-304 replaced a 10-minute TTL with no TTL at all. The DoD forbids TTL
        // complexity absent evidence that runtime schema changes must be observed
        // automatically, and none was produced: schema changes arrive by migration,
        // which is a deploy, and a deploy restarts the process. So the guarantee to
        // pin is that repeated lookups NEVER re-fetch — no clock, no expiry window,
        // nothing that can quietly re-hit DatabaseMetaData on the security path.
        val fetchCount = AtomicInteger(0)
        val service = newService(fetchCount)

        service.validateAndGetColumns("TESTUSER", "EMPLOYEE")
        assertThat(fetchCount.get()).isEqualTo(1)

        repeat(50) { service.validateAndGetColumns("TESTUSER", "EMPLOYEE") }
        assertThat(fetchCount.get()).isEqualTo(1)

        // ...and the value served is still correct, not just cheap.
        assertThat(service.validateAndGetColumns("TESTUSER", "EMPLOYEE"))
            .containsExactlyInAnyOrderElementsOf(columnNames)
        assertThat(fetchCount.get()).isEqualTo(1)
    }

    @Test
    @DisplayName("clearCache forces a re-fetch on the next lookup")
    fun testClearCacheForcesRefetch() {
        val fetchCount = AtomicInteger(0)
        val service = newService(fetchCount)

        service.validateAndGetColumns("TESTUSER", "EMPLOYEE")
        service.clearCache()
        service.validateAndGetColumns("TESTUSER", "EMPLOYEE")

        assertThat(fetchCount.get()).isEqualTo(2)
    }

    private fun newService(fetchCount: AtomicInteger, fetchLatencyMs: Long = 0): SecurityValidationService =
        SecurityValidationService(
            dataSource = stubDataSource(fetchCount, fetchLatencyMs),
            allowlistService = AllowlistService(
                object : TableAllowlistConfig {
                    override fun tables(): List<TableConfig> = listOf(
                        tableConfig("TESTUSER", "EMPLOYEE", listOf("EMP_ID"))
                    )
                }
            )
        )

    private fun tableConfig(schema: String, table: String, pkColumns: List<String>) =
        object : TableConfig {
            override fun schema(): String = schema
            override fun table(): String = table
            override fun pkColumns(): List<String> = pkColumns
        }

    /**
     * Stubs exactly the JDBC surface fetchColumnMetadata touches:
     * DataSource.getConnection -> Connection.getMetaData ->
     * DatabaseMetaData.getColumns -> ResultSet(next/getString/close).
     * Anything else fails loudly. Each getColumns call counts one DB fetch and
     * returns a fresh cursor.
     */
    private fun stubDataSource(fetchCount: AtomicInteger, fetchLatencyMs: Long): DataSource {
        val metaData = proxy<DatabaseMetaData> { method, _ ->
            when (method.name) {
                "getColumns" -> {
                    fetchCount.incrementAndGet()
                    if (fetchLatencyMs > 0) Thread.sleep(fetchLatencyMs)
                    columnResultSet()
                }
                else -> unsupported(method)
            }
        }
        val connection = proxy<Connection> { method, _ ->
            when (method.name) {
                "getMetaData" -> metaData
                "close" -> null
                else -> unsupported(method)
            }
        }
        return proxy<DataSource> { method, _ ->
            when (method.name) {
                "getConnection" -> connection
                else -> unsupported(method)
            }
        }
    }

    private fun columnResultSet(): ResultSet {
        val cursor = AtomicInteger(-1)
        return proxy { method, _ ->
            when (method.name) {
                "next" -> cursor.incrementAndGet() < columnNames.size
                "getString" -> columnNames[cursor.get()]
                "close" -> null
                else -> unsupported(method)
            }
        }
    }

    private inline fun <reified T> proxy(crossinline handler: (Method, Array<Any?>?) -> Any?): T =
        Proxy.newProxyInstance(
            T::class.java.classLoader,
            arrayOf(T::class.java),
            InvocationHandler { _, method, args -> handler(method, args) }
        ) as T

    private fun unsupported(method: Method): Nothing =
        throw UnsupportedOperationException("Not stubbed: ${method.name}")
}
