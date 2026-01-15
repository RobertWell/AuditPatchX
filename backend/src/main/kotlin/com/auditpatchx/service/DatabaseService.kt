package com.auditpatchx.service

import com.auditpatchx.model.*
import jakarta.enterprise.context.ApplicationScoped
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.core.kotlin.KotlinPlugin
import org.slf4j.LoggerFactory
import java.time.format.DateTimeFormatter
import javax.sql.DataSource

@ApplicationScoped
class DatabaseService(
    dataSource: DataSource,
    private val securityService: SecurityValidationService,
    private val allowlistService: com.auditpatchx.config.AllowlistService
) {
    private val logger = LoggerFactory.getLogger(DatabaseService::class.java)
    private val jdbi: Jdbi = Jdbi.create(dataSource).installPlugin(KotlinPlugin())

    /**
     * Execute query with filters
     */
    fun query(request: QueryRequest): QueryResponse {
        // Validate table access and get allowed columns
        val allowedColumns = securityService.validateAndGetColumns(request.schema, request.table)

        // Validate filter columns
        request.filters?.forEach { filter ->
            securityService.validateColumns(allowedColumns, listOf(filter.col))
            validateOperator(filter.op)
        }

        // Get column metadata for type conversions
        val columnMetadata = securityService.getDetailedColumnMetadata(request.schema, request.table)
        val columnTypeMap = columnMetadata.associate { it.name.uppercase() to it.type }

        // Enforce limit constraint
        val limit = request.limit.coerceIn(1, 200)

        // Build SQL query
        val sql = buildQuerySql(request.schema, request.table, request.filters, limit)

        logger.debug("Executing query: $sql")

        return jdbi.withHandle<QueryResponse, Exception> { handle ->
            var query = handle.createQuery(sql)

            // Bind filter values using named parameters with type conversion
            request.filters?.forEachIndexed { index, filter ->
                val columnType = columnTypeMap[filter.col.uppercase()]
                val convertedValue = convertValueForBinding(filter.value, columnType)
                query = query.bind("value$index", convertedValue)
            }

            val rows = query.mapToMap().list().map { row ->
                normalizeRowValues(row.toUppercaseKeys(), columnTypeMap)
            }

            QueryResponse(
                columns = if (rows.isNotEmpty()) rows[0].keys.toList() else emptyList(),
                rows = rows
            )
        }
    }

    /**
     * Get row by primary key
     */
    fun getByPk(request: GetByPkRequest): GetByPkResponse {
        // Validate table access
        securityService.validateAndGetColumns(request.schema, request.table)

        // Validate PK columns
        securityService.validatePkColumns(request.schema, request.table, request.pk.keys)

        // Get column metadata to properly handle type conversions
        val columnMetadata = securityService.getDetailedColumnMetadata(request.schema, request.table)
        val columnTypeMap = columnMetadata.associate { it.name.uppercase() to it.type }

        // Build SQL
        val sql = buildGetByPkSql(request.schema, request.table, request.pk.keys)

        logger.debug("Executing get by PK: $sql")

        return jdbi.withHandle<GetByPkResponse, Exception> { handle ->
            var query = handle.createQuery(sql)

            // Bind PK values with proper type conversion
            request.pk.forEach { (key, value) ->
                val columnType = columnTypeMap[key.uppercase()]
                val convertedValue = convertValueForBinding(value, columnType)
                query = query.bind(key, convertedValue)
            }

            val row = query.mapToMap().findOne().orElse(null)
                ?.toUppercaseKeys()
                ?.let { normalizeRowValues(it, columnTypeMap) }
                ?: throw NotFoundException("Row not found")

            GetByPkResponse(row = row)
        }
    }

    /**
     * Validate patch request
     */
    fun validatePatch(request: ValidatePatchRequest): ValidatePatchResponse {
        try {
            // Validate table access
            val allowedColumns = securityService.validateAndGetColumns(request.schema, request.table)

            // Validate PK columns
            securityService.validatePkColumns(request.schema, request.table, request.pk.keys)

            // Validate set columns
            securityService.validateColumns(allowedColumns, request.set.keys)

            // Ensure set doesn't contain PK columns
            securityService.validateSetColumnsNotPk(request.schema, request.table, request.set.keys)

            return ValidatePatchResponse(
                ok = true,
                normalizedSet = request.set
            )
        } catch (e: SecurityException) {
            logger.warn("Patch validation failed: ${e.message}")
            return ValidatePatchResponse(
                ok = false,
                error = e.message
            )
        }
    }

    /**
     * Update row by primary key
     */
    fun update(request: UpdateRequest): UpdateResponse {
        // Validate table access
        val allowedColumns = securityService.validateAndGetColumns(request.schema, request.table)

        // Validate PK columns
        securityService.validatePkColumns(request.schema, request.table, request.pk.keys)

        // Validate set columns
        securityService.validateColumns(allowedColumns, request.set.keys)

        // Ensure set doesn't contain PK columns
        securityService.validateSetColumnsNotPk(request.schema, request.table, request.set.keys)

        // Get column metadata for type conversions
        val columnMetadata = securityService.getDetailedColumnMetadata(request.schema, request.table)
        val columnTypeMap = columnMetadata.associate { it.name.uppercase() to it.type }

        // Build UPDATE SQL
        val updateStatement = buildUpdateStatement(
            request.schema,
            request.table,
            request.set,
            request.pk.keys,
            columnTypeMap
        )

        logger.info(
            "Executing update: schema=${request.schema}, table=${request.table}, " +
                    "pk=${request.pk}, set=${request.set.keys}, reason=${request.reason}"
        )

        return jdbi.inTransaction<UpdateResponse, Exception> { handle ->
            var update = handle.createUpdate(updateStatement.sql)

            // Bind SET values with type conversion
            updateStatement.bindings.forEach { (key, value) ->
                update = update.bind(key, value)
            }

            // Bind PK values with type conversion
            request.pk.forEach { (key, value) ->
                val columnType = columnTypeMap[key.uppercase()]
                val convertedValue = convertValueForBinding(value, columnType)
                update = update.bind("pk_$key", convertedValue)
            }

            val updated = update.execute()

            // Fetch updated row
            val fetchSql = buildGetByPkSql(request.schema, request.table, request.pk.keys)
            var query = handle.createQuery(fetchSql)

            request.pk.forEach { (key, value) ->
                val columnType = columnTypeMap[key.uppercase()]
                val convertedValue = convertValueForBinding(value, columnType)
                query = query.bind(key, convertedValue)
            }

            val row = query.mapToMap().findOne().orElse(emptyMap()).toUppercaseKeys()
                .let { normalizeRowValues(it, columnTypeMap) }

            UpdateResponse(updated = updated, row = row)
        }
    }

    /**
     * Get table metadata
     */
    fun getTableMetadata(schema: String, table: String): TableMetadataResponse {
        // Validate table access
        securityService.validateAndGetColumns(schema, table)

        val columns = securityService.getDetailedColumnMetadata(schema, table)

        // Get PK columns from config via the injected allowlistService
        val pkColumns = allowlistService.getTableConfig(schema, table)?.pkColumns() ?: emptyList()

        return TableMetadataResponse(
            pkColumns = pkColumns,
            columns = columns.map {
                ColumnMetadata(
                    name = it.name,
                    type = it.type,
                    nullable = it.nullable
                )
            },
            readonlyColumns = emptyList(), // Can be configured per table
            diffPolicy = DiffPolicy()
        )
    }

    /**
     * Build SELECT query SQL with filters
     */
    private fun buildQuerySql(
        schema: String,
        table: String,
        filters: List<FilterCondition>?,
        limit: Int
    ): String {
        val whereClause = filters?.mapIndexed { index, filter ->
            val column = filter.col.uppercase()
            when (filter.op) {
                "eq" -> "$column = :value$index"
                "contains" -> "$column LIKE '%' || :value$index || '%'"
                "startsWith" -> "$column LIKE :value$index || '%'"
                "gt" -> "$column > :value$index"
                "gte" -> "$column >= :value$index"
                "lt" -> "$column < :value$index"
                "lte" -> "$column <= :value$index"
                else -> throw IllegalArgumentException("Invalid operator: ${filter.op}")
            }
        }?.joinToString(" AND ") ?: "1=1"

        return """
            SELECT * FROM ${schema.uppercase()}.${table.uppercase()}
            WHERE $whereClause
            FETCH FIRST $limit ROWS ONLY
        """.trimIndent()
    }

    /**
     * Build SELECT by PK SQL
     */
    private fun buildGetByPkSql(schema: String, table: String, pkColumns: Set<String>): String {
        val whereClause = pkColumns.map { "${it.uppercase()} = :$it" }.joinToString(" AND ")

        return """
            SELECT * FROM ${schema.uppercase()}.${table.uppercase()}
            WHERE $whereClause
        """.trimIndent()
    }

    /**
     * Build UPDATE SQL
     */
    private data class UpdateStatement(
        val sql: String,
        val bindings: Map<String, Any?>
    )

    private fun buildUpdateStatement(
        schema: String,
        table: String,
        setValues: Map<String, Any?>,
        pkColumns: Set<String>,
        columnTypeMap: Map<String, String>
    ): UpdateStatement {
        val bindings = mutableMapOf<String, Any?>()
        val setClause = setValues.map { (key, value) ->
            val columnType = columnTypeMap[key.uppercase()]
            if (isClobColumn(columnType) && value is String) {
                "${key.uppercase()} = ${buildClobUpdateExpression(value)}"
            } else if (isClobColumn(columnType) && value == null) {
                "${key.uppercase()} = NULL"
            } else {
                val bindingKey = "set_$key"
                val convertedValue = convertValueForBinding(value, columnType)
                bindings[bindingKey] = convertedValue
                "${key.uppercase()} = :$bindingKey"
            }
        }.joinToString(", ")
        val whereClause = pkColumns.map { "${it.uppercase()} = :pk_$it" }.joinToString(" AND ")

        val sql = """
            UPDATE ${schema.uppercase()}.${table.uppercase()}
            SET $setClause
            WHERE $whereClause
        """.trimIndent()

        return UpdateStatement(sql = sql, bindings = bindings)
    }

    private fun isClobColumn(columnType: String?): Boolean {
        return columnType?.equals("CLOB", ignoreCase = true) == true
    }

    private fun buildClobUpdateExpression(value: String): String {
        val escaped = value.replace("'", "''")
        if (escaped.isEmpty()) {
            return "TO_CLOB('')"
        }

        val chunks = escaped.chunked(4000)
        val concatenated = chunks.joinToString(" || ") { "'$it'" }
        return "TO_CLOB('') || $concatenated"
    }

    /**
     * Validate filter operator
     */
    private fun validateOperator(op: String) {
        val validOperators = setOf("eq", "contains", "startsWith", "gt", "gte", "lt", "lte")
        if (op !in validOperators) {
            throw IllegalArgumentException("Invalid operator: $op. Allowed: ${validOperators.joinToString()}")
        }
    }

    /**
     * Convert value for JDBC binding based on column type.
     * Handles special case for Oracle DATE columns which need java.sql.Date.
     */
    private fun convertValueForBinding(value: Any?, columnType: String?): Any? {
        if (value == null || columnType == null) {
            return value
        }

        if (value is String) {
            val typeUpper = columnType.uppercase()
            val isTemporalType = typeUpper.contains("TIMESTAMP") || typeUpper == "DATE"
            if (isTemporalType) {
                val parsed = parseTemporalString(value)
                if (parsed != null) {
                    return when {
                        typeUpper.contains("TIMESTAMP WITH TIME ZONE") -> parsed.offsetDateTime
                        typeUpper.contains("TIMESTAMP WITH LOCAL TIME ZONE") -> parsed.offsetDateTime.toLocalDateTime()
                        typeUpper.contains("TIMESTAMP") -> parsed.localDateTime
                        typeUpper == "DATE" -> java.sql.Timestamp.valueOf(parsed.localDateTime)
                        else -> value
                    }
                }
            }
        }

        return value
    }

    private fun normalizeRowValues(
        row: Map<String, Any?>,
        columnTypeMap: Map<String, String>
    ): Map<String, Any?> {
        return row.mapValues { (key, value) ->
            val columnType = columnTypeMap[key.uppercase()]
            normalizeValueForJson(value, columnType)
        }
    }

    private fun normalizeValueForJson(value: Any?, columnType: String?): Any? {
        if (value == null) return null

        return when (value) {
            is oracle.sql.TIMESTAMP -> value.timestampValue().toLocalDateTime()
                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            is java.sql.Timestamp -> value.toLocalDateTime()
                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            is oracle.sql.DATE -> value.timestampValue().toLocalDateTime()
                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            is java.sql.Date -> value.toLocalDate()
                .format(DateTimeFormatter.ISO_LOCAL_DATE)
            else -> {
                when (value.javaClass.name) {
                    "oracle.sql.TIMESTAMPTZ",
                    "oracle.sql.TIMESTAMPLTZ" -> value.toString()
                    else -> value
                }
            }
        }
    }

    private data class ParsedTemporal(
        val offsetDateTime: java.time.OffsetDateTime,
        val localDateTime: java.time.LocalDateTime
    )

    private fun parseTemporalString(value: String): ParsedTemporal? {
        if (value.isBlank()) return null

        val trimmed = value.trim()
        val parsers = listOf<(String) -> ParsedTemporal?>(
            { input ->
                runCatching {
                    val odt = java.time.OffsetDateTime.parse(input)
                    ParsedTemporal(odt, odt.toLocalDateTime())
                }.getOrNull()
            },
            { input ->
                runCatching {
                    val zdt = java.time.ZonedDateTime.parse(input)
                    ParsedTemporal(zdt.toOffsetDateTime(), zdt.toLocalDateTime())
                }.getOrNull()
            },
            { input ->
                runCatching {
                    val ldt = java.time.LocalDateTime.parse(input)
                    ParsedTemporal(ldt.atOffset(java.time.ZoneOffset.UTC), ldt)
                }.getOrNull()
            },
            { input ->
                runCatching {
                    val ld = java.time.LocalDate.parse(input)
                    val ldt = ld.atStartOfDay()
                    ParsedTemporal(ldt.atOffset(java.time.ZoneOffset.UTC), ldt)
                }.getOrNull()
            },
            { input ->
                runCatching {
                    val formatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss[.SSS]")
                    val ldt = java.time.LocalDateTime.parse(input, formatter)
                    ParsedTemporal(ldt.atOffset(java.time.ZoneOffset.UTC), ldt)
                }.getOrNull()
            }
        )

        for (parser in parsers) {
            val parsed = parser(trimmed)
            if (parsed != null) return parsed
        }

        logger.warn("Failed to parse temporal value: $value, using as-is")
        return null
    }

    /**
     * Convert map keys to uppercase for Oracle compatibility.
     * Oracle JDBC returns column names in lowercase by default, but we want uppercase.
     */
    private fun Map<String, Any?>.toUppercaseKeys(): Map<String, Any?> {
        return this.entries.associate { (key, value) -> key.uppercase() to value }
    }
}

class NotFoundException(message: String) : RuntimeException(message)
