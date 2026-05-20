package com.auditpatchx.service

import com.auditpatchx.model.*
import com.auditpatchx.config.UiFeatureConfig
import com.auditpatchx.config.SyncTableConfig
import jakarta.enterprise.context.ApplicationScoped
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.core.kotlin.KotlinPlugin
import org.slf4j.LoggerFactory
import java.time.format.DateTimeFormatter
import java.sql.Clob
import javax.sql.DataSource

@ApplicationScoped
class DatabaseService(
    dataSource: DataSource,
    private val securityService: SecurityValidationService,
    private val allowlistService: com.auditpatchx.config.AllowlistService,
    private val uiFeatureConfig: UiFeatureConfig,
    private val syncTableConfig: SyncTableConfig
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
            securityService.validateSetColumnsNotReadonly(request.set.keys, getReadonlyColumnsSet())

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
        securityService.validateSetColumnsNotReadonly(request.set.keys, getReadonlyColumnsSet())

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
     * Compare two tables
     */
    fun compareTables(request: CompareJobRequest): CompareJobResponse {
        val (schema1, table1) = parseSchemaTable(request.tableOne)
        val (schema2, table2) = parseSchemaTable(request.tableTwo)

        val allowedColumns1 = securityService.validateAndGetColumns(schema1, table1)
        val allowedColumns2 = securityService.validateAndGetColumns(schema2, table2)

        securityService.validateColumns(allowedColumns1, request.syncPk)
        securityService.validateColumns(allowedColumns2, request.syncPk)
        securityService.validatePkColumns(schema1, table1, request.syncPk.toSet())
        securityService.validatePkColumns(schema2, table2, request.syncPk.toSet())
        securityService.validateColumns(allowedColumns1, request.ignoreColumns)
        securityService.validateColumns(allowedColumns2, request.ignoreColumns)

        val columnMetadata1 = securityService.getDetailedColumnMetadata(schema1, table1)
        val columnTypeMap1 = columnMetadata1.associate { it.name.uppercase() to it.type }

        val columnMetadata2 = securityService.getDetailedColumnMetadata(schema2, table2)
        val columnTypeMap2 = columnMetadata2.associate { it.name.uppercase() to it.type }

        val limit = request.limit.coerceIn(1, 1000)

        return jdbi.inTransaction<CompareJobResponse, Exception> { handle ->
            // Query source table (tableOne)
            val sql1 = """
                SELECT * FROM ${schema1.uppercase()}.${table1.uppercase()}
                FETCH FIRST $limit ROWS ONLY
            """.trimIndent()

            val sourceRows = handle.createQuery(sql1)
                .mapToMap()
                .list()
                .map { row -> normalizeRowValues(row.toUppercaseKeys(), columnTypeMap1) }

            val differences = mutableListOf<CompareJobDiffRow>()

            for (sourceRow in sourceRows) {
                // Extract PKs
                val pkValues = request.syncPk.associateWith { sourceRow[it.uppercase()] }
                if (pkValues.values.any { it == null }) {
                    continue // Skip rows missing PK values
                }

                // Query target table (tableTwo)
                val whereClause = request.syncPk.joinToString(" AND ") { "${it.uppercase()} = :$it" }
                val sql2 = """
                    SELECT * FROM ${schema2.uppercase()}.${table2.uppercase()}
                    WHERE $whereClause
                """.trimIndent()

                var query2 = handle.createQuery(sql2)
                request.syncPk.forEach { pkCol ->
                    val columnType = columnTypeMap2[pkCol.uppercase()]
                    val convertedValue = convertValueForBinding(pkValues[pkCol], columnType)
                    query2 = query2.bind(pkCol, convertedValue)
                }

                val targetRowOpt = query2.mapToMap().findOne()

                val pkString = request.syncPk.joinToString("-") { pkValues[it].toString() }

                if (!targetRowOpt.isPresent) {
                    val syncPkUpper = request.syncPk.map { it.uppercase() }.toSet()
                    val ignoreUpper = request.ignoreColumns.map { it.uppercase() }.toSet()
                    val insertChanges = sourceRow
                        .filter { (col, _) -> !syncPkUpper.contains(col) && !ignoreUpper.contains(col) }
                        .map { (col, srcVal) ->
                            CompareJobChange(
                                column = col,
                                sourceValue = srcVal?.toString() ?: "NULL",
                                targetValue = "NULL",
                                isLongText = (srcVal?.toString()?.length ?: 0) > 100
                            )
                        }
                    differences.add(
                        CompareJobDiffRow(
                            pk = pkString,
                            pkMap = request.syncPk.associate { it.uppercase() to (pkValues[it]?.toString() ?: "") },
                            status = "INSERT",
                            changedColumns = insertChanges.size,
                            updatedBy = "system",
                            reviewStatus = "PENDING",
                            changes = insertChanges
                        )
                    )
                } else {
                    val targetRow = normalizeRowValues(targetRowOpt.get().toUppercaseKeys(), columnTypeMap2)
                    val changes = mutableListOf<CompareJobChange>()
                    
                    val ignoreSet = request.ignoreColumns.map { it.uppercase() }.toSet()

                    sourceRow.forEach { (col, srcVal) ->
                        if (!ignoreSet.contains(col) && !request.syncPk.map { it.uppercase() }.contains(col)) {
                            val tgtVal = targetRow[col]
                            if (srcVal.toString() != tgtVal.toString()) {
                                changes.add(
                                    CompareJobChange(
                                        column = col,
                                        sourceValue = srcVal?.toString() ?: "NULL",
                                        targetValue = tgtVal?.toString() ?: "NULL",
                                        isLongText = (srcVal?.toString()?.length ?: 0) > 100 || (tgtVal?.toString()?.length ?: 0) > 100
                                    )
                                )
                            }
                        }
                    }

                    if (changes.isNotEmpty()) {
                        differences.add(
                            CompareJobDiffRow(
                                pk = pkString,
                                pkMap = request.syncPk.associate { it.uppercase() to (pkValues[it]?.toString() ?: "") },
                                status = "UPDATE",
                                changedColumns = changes.size,
                                updatedBy = "system",
                                reviewStatus = "PENDING",
                                changes = changes
                            )
                        )
                    }
                }
            }

            CompareJobResponse(differences = differences)
        }
    }

    fun validateCompareTables(request: CompareValidationRequest): CompareValidationResponse {
        val (schema1, table1) = parseSchemaTable(request.tableOne)
        val (schema2, table2) = parseSchemaTable(request.tableTwo)

        securityService.validateAndGetColumns(schema1, table1)
        securityService.validateAndGetColumns(schema2, table2)

        val pk1 = (allowlistService.getTableConfig(schema1, table1)?.pkColumns() ?: emptyList())
            .map { it.uppercase() }
            .toSet()
        val pk2 = (allowlistService.getTableConfig(schema2, table2)?.pkColumns() ?: emptyList())
            .map { it.uppercase() }
            .toSet()

        val tableOneColumns = loadOracleColumnTypes(schema1, table1)
        val tableTwoColumns = loadOracleColumnTypes(schema2, table2)

        val cols1 = tableOneColumns.keys
        val cols2 = tableTwoColumns.keys

        val missingInTableOne = (cols2 - cols1).sorted()
        val missingInTableTwo = (cols1 - cols2).sorted()
        val commonColumns = cols1.intersect(cols2)

        val mismatchedTypes = commonColumns
            .filter { col -> tableOneColumns[col] != tableTwoColumns[col] }
            .sorted()
            .map { col ->
                ColumnTypeMismatch(
                    column = col,
                    tableOneType = tableOneColumns[col] ?: "UNKNOWN",
                    tableTwoType = tableTwoColumns[col] ?: "UNKNOWN"
                )
            }

        val pkMatch = pk1 == pk2
        val columnTypeMatch = missingInTableOne.isEmpty() && missingInTableTwo.isEmpty() && mismatchedTypes.isEmpty()
        val compatible = pkMatch && columnTypeMatch

        val details = when {
            compatible -> "Tables are compatible for sync"
            !pkMatch -> "Primary key columns do not match between the two tables"
            else -> "Column name/type mismatch detected between the two tables"
        }

        return CompareValidationResponse(
            compatible = compatible,
            pkMatch = pkMatch,
            columnTypeMatch = columnTypeMatch,
            missingInTableOne = missingInTableOne,
            missingInTableTwo = missingInTableTwo,
            mismatchedTypes = mismatchedTypes,
            details = details
        )
    }

    fun getSyncPairConfigs(): List<SyncPairConfigInfo> {
        return syncTableConfig.pairs().map { pair ->
            val validation = validateCompareTables(
                CompareValidationRequest(
                    tableOne = pair.tables().tableA(),
                    tableTwo = pair.tables().tableB()
                )
            )

            SyncPairConfigInfo(
                pairName = pair.pairName(),
                db = pair.db(),
                tableA = pair.tables().tableA(),
                tableB = pair.tables().tableB(),
                pkColumns = pair.pkColumns().map { it.uppercase() },
                excludeColumns = pair.excludeColumns().map { it.uppercase() },
                validation = validation
            )
        }
    }

    private fun loadOracleColumnTypes(schema: String, table: String): Map<String, String> {
        val owner = schema.uppercase()
        val tableName = table.uppercase()

        return jdbi.withHandle<Map<String, String>, Exception> { handle ->
            val exists = handle.createQuery(
                """
                SELECT 1
                FROM all_tables
                WHERE owner = :owner
                  AND table_name = :tableName
                """.trimIndent()
            )
                .bind("owner", owner)
                .bind("tableName", tableName)
                .mapTo(Int::class.java)
                .findOne()
                .isPresent

            if (!exists) {
                throw IllegalArgumentException("Table not found in Oracle metadata: $owner.$tableName")
            }

            handle.createQuery(
                """
                SELECT column_name, data_type
                FROM all_tab_columns
                WHERE owner = :owner
                  AND table_name = :tableName
                """.trimIndent()
            )
                .bind("owner", owner)
                .bind("tableName", tableName)
                .mapToMap()
                .list()
                .associate { row ->
                    row["COLUMN_NAME"].toString().uppercase() to row["DATA_TYPE"].toString().uppercase()
                }
        }
    }

    private fun parseSchemaTable(input: String): Pair<String, String> {
        val parts = input.split(".")
        if (parts.size != 2) throw IllegalArgumentException("Invalid table format. Expected schema.table, got $input")
        return Pair(parts[0], parts[1])
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
            readonlyColumns = getReadonlyColumnsList(),
            diffPolicy = DiffPolicy(
                excludeTypes = emptyList(),
                excludeColumns = uiFeatureConfig.diffPolicy().excludeColumns().orElse(emptyList()).filter { it.isNotBlank() },
                includeColumns = uiFeatureConfig.diffPolicy().includeColumns().orElse(emptyList()).filter { it.isNotBlank() }
                    .takeIf { it.isNotEmpty() }
            )
        )
    }

    private fun getReadonlyColumnsList(): List<String> {
        return uiFeatureConfig.readonly().columns()
            .map { it.uppercase() }
            .filter { it.isNotBlank() }
            .distinct()
    }

    private fun getReadonlyColumnsSet(): Set<String> = getReadonlyColumnsList().toSet()

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
            is Clob -> readClobValue(value)
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

    private fun readClobValue(clob: Clob): String {
        val length = clob.length()
        if (length == 0L) {
            return ""
        }
        val safeLength = length.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        return clob.getSubString(1, safeLength)
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

    fun reviewCompareRow(request: CompareReviewRequest): CompareReviewResponse {
        if (request.status !in setOf("APPROVED", "REJECTED")) {
            throw IllegalArgumentException("status must be APPROVED or REJECTED")
        }
        logger.info("REVIEW_DECISION pk=${request.pk} status=${request.status}")

        if (request.status == "APPROVED") {
            val (schema1, table1) = parseSchemaTable(request.tableOne)
            val (schema2, table2) = parseSchemaTable(request.tableTwo)

            val allowedCols1 = securityService.validateAndGetColumns(schema1, table1)
            val allowedCols2 = securityService.validateAndGetColumns(schema2, table2)

            val syncPkUpper = request.syncPk.map { it.uppercase() }.toSet()
            val ignoreUpper = request.ignoreColumns.map { it.uppercase() }.toSet()

            // Columns present in both tables, minus ignored
            val cols2Set = allowedCols2.map { it.uppercase() }.toSet()
            val syncColumns = allowedCols1.map { it.uppercase() }
                .filter { it in cols2Set && it !in ignoreUpper }
            val dataColumns = syncColumns.filter { it !in syncPkUpper }

            // PK type metadata for proper binding
            val columnTypeMap2 = securityService.getDetailedColumnMetadata(schema2, table2)
                .associate { it.name.uppercase() to it.type }

            val src = "${schema1.uppercase()}.${table1.uppercase()}"
            val tgt = "${schema2.uppercase()}.${table2.uppercase()}"
            val whereClause = syncPkUpper.joinToString(" AND ") { "$it = :pk_$it" }

            jdbi.inTransaction<Unit, Exception> { handle ->
                val rows = when (request.rowStatus) {
                    "UPDATE" -> {
                        if (dataColumns.isEmpty()) {
                            logger.warn("APPROVE_UPDATE nothing to set pk=${request.pkMap}")
                            0
                        } else {
                            val colsList = dataColumns.joinToString(", ")
                            val sql = "UPDATE $tgt SET ($colsList) = (SELECT $colsList FROM $src WHERE $whereClause) WHERE $whereClause"
                            var stmt = handle.createUpdate(sql)
                            request.pkMap.forEach { (col, value) ->
                                stmt = stmt.bind("pk_$col", convertValueForBinding(value, columnTypeMap2[col.uppercase()]))
                            }
                            stmt.execute()
                        }
                    }
                    "INSERT" -> {
                        val colsList = syncColumns.joinToString(", ")
                        val sql = "INSERT INTO $tgt ($colsList) SELECT $colsList FROM $src WHERE $whereClause"
                        var stmt = handle.createUpdate(sql)
                        request.pkMap.forEach { (col, value) ->
                            stmt = stmt.bind("pk_$col", convertValueForBinding(value, columnTypeMap2[col.uppercase()]))
                        }
                        stmt.execute()
                    }
                    else -> throw IllegalArgumentException("Unsupported rowStatus: ${request.rowStatus}")
                }
                logger.info("APPROVE_${request.rowStatus} $tgt pk=${request.pkMap} rows=$rows")
            }
        }

        return CompareReviewResponse(pk = request.pk, status = request.status)
    }
}

class NotFoundException(message: String) : RuntimeException(message)
