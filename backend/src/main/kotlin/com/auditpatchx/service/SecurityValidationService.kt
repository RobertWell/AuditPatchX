package com.auditpatchx.service

import com.auditpatchx.config.AllowlistService
import jakarta.enterprise.context.ApplicationScoped
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

@ApplicationScoped
class SecurityValidationService(
    private val dataSource: DataSource,
    private val allowlistService: AllowlistService
) {
    private val logger = LoggerFactory.getLogger(SecurityValidationService::class.java)

    companion object {
        // HEL-304: bound cache staleness. Schema changes are rare, so 10 minutes
        // keeps DatabaseMetaData traffic negligible while ensuring a schema
        // change is picked up without a restart (the cache was previously never
        // invalidated outside tests).
        internal val CACHE_TTL_MILLIS = TimeUnit.MINUTES.toMillis(10)
    }

    // HEL-304: this @ApplicationScoped singleton is mutated concurrently on the
    // request hot path — a plain HashMap risks lost updates and table
    // corruption under parallel first-touch. Entries carry a fetch timestamp
    // and are re-fetched after CACHE_TTL_MILLIS.
    // Cache for column metadata: "SCHEMA.TABLE" -> CachedColumns
    private val columnMetadataCache = ConcurrentHashMap<String, CachedColumns>()

    // Time source in millis; overridable so unit tests can age cache entries
    // deterministically instead of sleeping through the TTL.
    internal var timeSource: () -> Long = System::currentTimeMillis

    /**
     * Validates table access and returns allowed columns from database metadata
     * Throws SecurityException if validation fails
     */
    fun validateAndGetColumns(schema: String, table: String): Set<String> {
        // Step 1: Validate against allowlist
        if (!allowlistService.isTableAllowed(schema, table)) {
            logger.warn("Access denied to non-allowlisted table: $schema.$table")
            throw SecurityException("Table $schema.$table is not in allowlist")
        }

        val key = "$schema.$table".uppercase()

        // Return cached metadata if available and not expired
        cachedColumns(key)?.let { return it }

        // Step 2: Fetch column metadata from database
        val columns = fetchColumnMetadata(schema, table)

        if (columns.isEmpty()) {
            throw SecurityException("Table $schema.$table does not exist or has no accessible columns")
        }

        // Cache and return
        return cacheAndGet(key, columns)
    }

    /**
     * Returns a live cached entry, evicting it first if past TTL.
     */
    private fun cachedColumns(key: String): Set<String>? {
        val entry = columnMetadataCache[key] ?: return null
        if (isExpired(entry)) {
            // Two-arg remove: evict only THIS stale entry, never a fresh one a
            // concurrent thread may have installed in the meantime.
            columnMetadataCache.remove(key, entry)
            return null
        }
        return entry.columns
    }

    /**
     * Publishes freshly fetched columns. The DB fetch deliberately happens
     * BEFORE this call — computeIfAbsent would hold a ConcurrentHashMap bin
     * lock across the DB round-trip, blocking unrelated requests. Instead,
     * racing first-touch threads may each fetch once, then converge on the
     * single entry that won putIfAbsent.
     */
    private fun cacheAndGet(key: String, columns: Set<String>): Set<String> {
        val fresh = CachedColumns(columns, timeSource())
        val existing = columnMetadataCache.putIfAbsent(key, fresh)
        if (existing == null) return columns
        if (!isExpired(existing)) return existing.columns
        // The existing entry expired between our cache miss and our fetch:
        // replace it with the fresh result (both racers hold fresh data, so
        // last-writer-wins is safe).
        columnMetadataCache[key] = fresh
        return columns
    }

    private fun isExpired(entry: CachedColumns): Boolean =
        timeSource() - entry.fetchedAtMillis >= CACHE_TTL_MILLIS

    private data class CachedColumns(val columns: Set<String>, val fetchedAtMillis: Long)

    /**
     * Validates column names against allowed columns
     */
    fun validateColumns(allowedColumns: Set<String>, requestedColumns: Collection<String>) {
        val invalidColumns = requestedColumns.filter { it.uppercase() !in allowedColumns }
        if (invalidColumns.isNotEmpty()) {
            throw SecurityException("Invalid columns: ${invalidColumns.joinToString()}")
        }
    }

    /**
     * Validates PK columns against configured PK
     */
    fun validatePkColumns(schema: String, table: String, pkKeys: Set<String>) {
        val tableConfig = allowlistService.getTableConfig(schema, table)
            ?: throw SecurityException("Table configuration not found")

        val expectedPk = tableConfig.pkColumns().map { it.uppercase() }.toSet()
        val providedPk = pkKeys.map { it.uppercase() }.toSet()

        if (expectedPk != providedPk) {
            throw SecurityException(
                "PK mismatch. Expected: ${expectedPk.joinToString()}, Got: ${providedPk.joinToString()}"
            )
        }
    }

    /**
     * Validates that set columns don't include PK columns
     */
    fun validateSetColumnsNotPk(schema: String, table: String, setKeys: Set<String>) {
        val tableConfig = allowlistService.getTableConfig(schema, table)
            ?: throw SecurityException("Table configuration not found")

        val pkColumnsUpper = tableConfig.pkColumns().map { it.uppercase() }.toSet()
        val setColumnsUpper = setKeys.map { it.uppercase() }

        val pkInSet = setColumnsUpper.filter { it in pkColumnsUpper }
        if (pkInSet.isNotEmpty()) {
            throw SecurityException("Cannot update PK columns (primary key): ${pkInSet.joinToString()}")
        }
    }

    fun validateSetColumnsNotReadonly(setKeys: Set<String>, readonlyColumns: Set<String>) {
        val setColumnsUpper = setKeys.map { it.uppercase() }
        val readonlyInSet = setColumnsUpper.filter { it in readonlyColumns }
        if (readonlyInSet.isNotEmpty()) {
            throw SecurityException("Cannot update readonly columns: ${readonlyInSet.joinToString()}")
        }
    }

    /**
     * Returns the columns that actually exist in the DB — no allowlist check.
     * Use this for read-only operations (compare, validate) where any accessible
     * table is fine. Throws SecurityException if the table doesn't exist.
     */
    fun getColumnsFromDb(schema: String, table: String): Set<String> {
        val key = "$schema.$table".uppercase()
        cachedColumns(key)?.let { return it }
        val columns = fetchColumnMetadata(schema, table)
        if (columns.isEmpty()) {
            throw SecurityException("Table $schema.$table does not exist or has no accessible columns")
        }
        return cacheAndGet(key, columns)
    }

    /**
     * Fetches column metadata from database using DatabaseMetaData
     */
    private fun fetchColumnMetadata(schema: String, table: String): Set<String> {
        return dataSource.connection.use { conn ->
            val metadata = conn.metaData
            val resultSet = metadata.getColumns(null, schema.uppercase(), table.uppercase(), null)

            val columns = mutableSetOf<String>()
            while (resultSet.next()) {
                val columnName = resultSet.getString("COLUMN_NAME")
                columns.add(columnName.uppercase())
            }
            resultSet.close()
            columns
        }
    }

    /**
     * Gets detailed column metadata including types and nullability
     */
    fun getDetailedColumnMetadata(schema: String, table: String): List<ColumnInfo> {
        return dataSource.connection.use { conn ->
            val metadata = conn.metaData
            val resultSet = metadata.getColumns(null, schema.uppercase(), table.uppercase(), null)

            val columns = mutableListOf<ColumnInfo>()
            while (resultSet.next()) {
                columns.add(
                    ColumnInfo(
                        name = resultSet.getString("COLUMN_NAME").uppercase(),
                        type = resultSet.getString("TYPE_NAME"),
                        nullable = resultSet.getInt("NULLABLE") == 1
                    )
                )
            }
            resultSet.close()
            columns
        }
    }

    data class ColumnInfo(
        val name: String,
        val type: String,
        val nullable: Boolean
    )

    /**
     * Clear cache (useful for testing or if schema changes)
     */
    fun clearCache() {
        columnMetadataCache.clear()
    }
}
