package com.auditpatchx.service

import com.auditpatchx.config.AllowlistService
import jakarta.enterprise.context.ApplicationScoped
import org.slf4j.LoggerFactory
import javax.sql.DataSource

@ApplicationScoped
class SecurityValidationService(
    private val dataSource: DataSource,
    private val allowlistService: AllowlistService
) {
    private val logger = LoggerFactory.getLogger(SecurityValidationService::class.java)

    // Cache for column metadata: "SCHEMA.TABLE" -> Set<String>
    private val columnMetadataCache = mutableMapOf<String, Set<String>>()

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

        // Return cached metadata if available
        columnMetadataCache[key]?.let { return it }

        // Step 2: Fetch column metadata from database
        val columns = fetchColumnMetadata(schema, table)

        if (columns.isEmpty()) {
            throw SecurityException("Table $schema.$table does not exist or has no accessible columns")
        }

        // Cache and return
        columnMetadataCache[key] = columns
        return columns
    }

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
