package com.auditpatchx.model

import com.fasterxml.jackson.annotation.JsonInclude

@JsonInclude(JsonInclude.Include.NON_NULL)
data class TableInfo(
    val schema: String,
    val table: String,
    val pkColumns: List<String>
)

data class FilterCondition(
    val col: String,
    val op: String, // eq, contains, startsWith, gt, gte, lt, lte
    val value: Any
)

data class QueryRequest(
    val schema: String,
    val table: String,
    val filters: List<FilterCondition>? = null,
    val limit: Int = 50
)

data class QueryResponse(
    val columns: List<String>,
    val rows: List<Map<String, Any?>>
)

data class GetByPkRequest(
    val schema: String,
    val table: String,
    val pk: Map<String, Any>
)

data class GetByPkResponse(
    val row: Map<String, Any?>
)

data class ValidatePatchRequest(
    val schema: String,
    val table: String,
    val pk: Map<String, Any>,
    val set: Map<String, Any?>
)

data class ValidatePatchResponse(
    val ok: Boolean,
    val normalizedSet: Map<String, Any?>? = null,
    val rejectedFields: List<String> = emptyList(),
    val warnings: List<String> = emptyList(),
    val error: String? = null
)

data class UpdateRequest(
    val schema: String,
    val table: String,
    val pk: Map<String, Any>,
    val set: Map<String, Any?>,
    val reason: String
)

data class UpdateResponse(
    val updated: Int,
    val row: Map<String, Any?>
)

data class TableMetadataRequest(
    val schema: String,
    val table: String
)

data class ColumnMetadata(
    val name: String,
    val type: String,
    val nullable: Boolean
)

data class DiffPolicy(
    val excludeTypes: List<String> = emptyList(),
    val excludeColumns: List<String> = emptyList(),
    val includeColumns: List<String>? = null
)

data class TableMetadataResponse(
    val pkColumns: List<String>,
    val columns: List<ColumnMetadata>,
    val readonlyColumns: List<String> = emptyList(),
    val diffPolicy: DiffPolicy = DiffPolicy()
)

data class ErrorResponse(
    val error: String,
    val details: String? = null
)
