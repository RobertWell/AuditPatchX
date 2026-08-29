package com.auditpatchx.service

import com.auditpatchx.config.AllowlistService
import jakarta.enterprise.context.ApplicationScoped
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap
import javax.sql.DataSource

@ApplicationScoped
class SecurityValidationService(
    private val dataSource: DataSource,
    private val allowlistService: AllowlistService
) {
    private val logger = LoggerFactory.getLogger(SecurityValidationService::class.java)

    // HEL-304: this @ApplicationScoped singleton is read and written concurrently
    // on the compare/patch validation hot path. A plain HashMap can lose updates,
    // duplicate work, or publish a half-built table under parallel first-touch —
    // on a SECURITY lookup, which decides which columns a caller may touch.
    //
    // NO TTL. An earlier revision added a 10-minute expiry, but the DoD says not
    // to add TTL complexity without evidence that runtime schema changes must be
    // observed automatically, and no such evidence was produced. A timer that
    // exists "just in case" is not free: it adds a clock dependency, an eviction
    // race between the read and the re-fetch, and a test seam (`timeSource`) that
    // only exists to serve the timer.
    //
    // CACHE-REFRESH BOUNDARY: restart / redeploy. Schema changes here arrive by
    // migration, which is a deploy — so the cache is refreshed by the same event
    // that changes the schema. `clearCache()` remains for tests and for an
    // explicit operational flush. If runtime schema mutation ever becomes a
    // supported production workflow, that needs a bounded invalidation task with
    // its own contract, not a background timer bolted on here.
    //
    // Cache for column metadata: "SCHEMA.TABLE" -> immutable column set
    private val columnMetadataCache = ConcurrentHashMap<String, Set<String>>()

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

        // Return cached metadata if present (refreshed on restart/redeploy)
        cachedColumns(key)?.let { return it }

        // Step 2: Fetch column metadata from database
        val columns = fetchColumnMetadata(schema, table)

        if (columns.isEmpty()) {
            throw SecurityException("Table $schema.$table does not exist or has no accessible columns")
        }

        // Cache and return
        return cacheAndGet(key, columns)
    }

    private fun cachedColumns(key: String): Set<String>? = columnMetadataCache[key]

    /**
     * Publishes freshly fetched columns and returns the ONE value every racer
     * agrees on.
     *
     * The DB fetch deliberately happens BEFORE this call. `computeIfAbsent` would
     * be the obvious primitive, but it holds a ConcurrentHashMap bin lock for the
     * duration of the mapping function — here a `DatabaseMetaData` round-trip —
     * stalling unrelated keys that hash to the same bin, and deadlocking outright
     * if the fetch ever re-entered the same map. So: fetch outside, then
     * `putIfAbsent`, which is atomic and equally guarantees a single published
     * value. Racing first-touch threads may each fetch once (idempotent,
     * read-only), then converge on the winner's entry and return it — so two
     * callers can never see two different column sets for one table.
     */
    private fun cacheAndGet(key: String, columns: Set<String>): Set<String> =
        columnMetadataCache.putIfAbsent(key, columns) ?: columns

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
