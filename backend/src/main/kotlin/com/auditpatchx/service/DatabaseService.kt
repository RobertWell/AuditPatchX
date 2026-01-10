package com.auditpatchx.service

import com.auditpatchx.model.*
import jakarta.enterprise.context.ApplicationScoped
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.core.kotlin.KotlinPlugin
import org.slf4j.LoggerFactory
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

        // Enforce limit constraint
        val limit = request.limit.coerceIn(1, 200)

        // Build SQL query
        val sql = buildQuerySql(request.schema, request.table, request.filters, limit)

        logger.debug("Executing query: $sql")

        return jdbi.withHandle<QueryResponse, Exception> { handle ->
            var query = handle.createQuery(sql)

            // Bind filter values using named parameters
            request.filters?.forEachIndexed { index, filter ->
                query = query.bind("value$index", filter.value)
            }

            val rows = query.mapToMap().list()

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

        // Build SQL
        val sql = buildGetByPkSql(request.schema, request.table, request.pk.keys)

        logger.debug("Executing get by PK: $sql")

        return jdbi.withHandle<GetByPkResponse, Exception> { handle ->
            var query = handle.createQuery(sql)

            // Bind PK values
            request.pk.forEach { (key, value) ->
                query = query.bind(key, value)
            }

            val row = query.mapToMap().findOne().orElse(null)
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

        // Build UPDATE SQL
        val sql = buildUpdateSql(request.schema, request.table, request.set.keys, request.pk.keys)

        logger.info(
            "Executing update: schema=${request.schema}, table=${request.table}, " +
                    "pk=${request.pk}, set=${request.set.keys}, reason=${request.reason}"
        )

        return jdbi.inTransaction<UpdateResponse, Exception> { handle ->
            var update = handle.createUpdate(sql)

            // Bind SET values
            request.set.forEach { (key, value) ->
                update = update.bind("set_$key", value)
            }

            // Bind PK values
            request.pk.forEach { (key, value) ->
                update = update.bind("pk_$key", value)
            }

            val updated = update.execute()

            // Fetch updated row
            val fetchSql = buildGetByPkSql(request.schema, request.table, request.pk.keys)
            var query = handle.createQuery(fetchSql)

            request.pk.forEach { (key, value) ->
                query = query.bind(key, value)
            }

            val row = query.mapToMap().findOne().orElse(emptyMap())

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
    private fun buildUpdateSql(
        schema: String,
        table: String,
        setColumns: Set<String>,
        pkColumns: Set<String>
    ): String {
        val setClause = setColumns.map { "${it.uppercase()} = :set_$it" }.joinToString(", ")
        val whereClause = pkColumns.map { "${it.uppercase()} = :pk_$it" }.joinToString(" AND ")

        return """
            UPDATE ${schema.uppercase()}.${table.uppercase()}
            SET $setClause
            WHERE $whereClause
        """.trimIndent()
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
}

class NotFoundException(message: String) : RuntimeException(message)
