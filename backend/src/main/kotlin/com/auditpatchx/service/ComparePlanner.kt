package com.auditpatchx.service

import com.auditpatchx.model.CompareJobChange
import com.auditpatchx.model.CompareJobDiffRow
import com.pkgrove.pkgrovekit.core.Choice

/**
 * HEL-162 / PkgroveKit adoption: the PURE half of the table-compare feature.
 *
 * Everything here is deterministic data-in/data-out — no connections, no
 * handles, no logging, no clock — so the whole diff policy (including the
 * HEL-27 CLOB line-ending rule) is unit-testable without Oracle or Quarkus.
 * `DatabaseService.compareTables` keeps only the I/O: read source rows, look
 * up each target row, and fold the routed results.
 *
 * Business routing uses PkgroveKit's `Choice` (workflow-style rule: a business
 * Left/Right is a VALID path, never an execution failure):
 *
 *   Left  = the target row is MISSING            -> an INSERT diff
 *   Right = the target row EXISTS                -> an UPDATE diff, or null
 *                                                   when nothing differs
 */
object ComparePlanner {

    /** PK rendering shared by both routes. */
    fun pkString(syncPk: List<String>, pkValues: Map<String, Any?>): String =
        syncPk.joinToString("-") { pkValues[it].toString() }

    fun pkMap(syncPk: List<String>, pkValues: Map<String, Any?>): Map<String, String> =
        syncPk.associate { it.uppercase() to (pkValues[it]?.toString() ?: "") }

    /** Extract the PK values for one source row; null if any PK is absent
     *  (such rows are skipped — pinned behavior). */
    fun pkValuesOrNull(sourceRow: Map<String, Any?>, syncPk: List<String>): Map<String, Any?>? {
        val values = syncPk.associateWith { sourceRow[it.uppercase()] }
        return if (values.values.any { it == null }) null else values
    }

    /**
     * Route one source row against its (maybe absent) target row.
     * [typeOf] supplies the Oracle column type (source first, target fallback)
     * for the CLOB comparison rule.
     */
    fun diffRow(
        sourceRow: Map<String, Any?>,
        targetRow: Map<String, Any?>?,
        syncPk: List<String>,
        ignoreColumns: Set<String>,
        typeOf: (String) -> String?,
    ): Choice<CompareJobDiffRow, CompareJobDiffRow?> {
        val pkValues = requireNotNull(pkValuesOrNull(sourceRow, syncPk)) {
            "diffRow requires a complete PK (filter with pkValuesOrNull first)"
        }
        val syncPkUpper = syncPk.map { it.uppercase() }.toSet()
        val ignoreUpper = ignoreColumns.map { it.uppercase() }.toSet()

        if (targetRow == null) {
            val changes = sourceRow
                .filter { (col, _) -> col !in syncPkUpper && col !in ignoreUpper }
                .map { (col, srcVal) -> change(col, srcVal, tgtVal = null) }
            return Choice.Left(diff(pkValues, syncPk, "INSERT", changes))
        }

        val changes = sourceRow.mapNotNull { (col, srcVal) ->
            if (col in ignoreUpper || col in syncPkUpper) return@mapNotNull null
            val tgtVal = targetRow[col]
            if (valuesEqual(srcVal, tgtVal, typeOf(col))) null
            else change(col, srcVal, tgtVal)
        }
        return Choice.Right(
            if (changes.isEmpty()) null else diff(pkValues, syncPk, "UPDATE", changes))
    }

    private fun diff(pkValues: Map<String, Any?>, syncPk: List<String>,
                     status: String, changes: List<CompareJobChange>) =
        CompareJobDiffRow(
            pk = pkString(syncPk, pkValues),
            pkMap = pkMap(syncPk, pkValues),
            status = status,
            changedColumns = changes.size,
            updatedBy = "system",
            reviewStatus = "PENDING",
            changes = changes,
        )

    private fun change(col: String, srcVal: Any?, tgtVal: Any?) = CompareJobChange(
        column = col,
        sourceValue = srcVal?.toString() ?: "NULL",
        targetValue = tgtVal?.toString() ?: "NULL",
        isLongText = (srcVal?.toString()?.length ?: 0) > 100 ||
                     (tgtVal?.toString()?.length ?: 0) > 100,
    )

    // ── HEL-27 equality rule (pure) ─────────────────────────────────────────
    // Equivalent Oracle CLOB content routinely differs only in line endings
    // across environments (CRLF vs LF vs CR). Normalize line endings for
    // CLOB/NCLOB comparison ONLY — every other type keeps exact comparison,
    // and null semantics are unchanged (null renders "null" on both sides).

    fun isClobLikeColumn(columnType: String?): Boolean =
        columnType != null &&
            (columnType.equals("CLOB", ignoreCase = true) ||
             columnType.equals("NCLOB", ignoreCase = true))

    fun normalizeClobLineEndings(value: String): String =
        value.replace("\r\n", "\n").replace('\r', '\n')

    fun valuesEqual(srcVal: Any?, tgtVal: Any?, columnType: String?): Boolean {
        var a = srcVal.toString()
        var b = tgtVal.toString()
        if (isClobLikeColumn(columnType)) {
            a = normalizeClobLineEndings(a)
            b = normalizeClobLineEndings(b)
        }
        return a == b
    }
}
