package com.auditpatchx.service

import com.pkgrove.pkgrovekit.core.Choice
import com.pkgrove.pkgrovekit.core.fold
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * HEL-162 / PkgroveKit-style proof: the ENTIRE compare policy is pure and runs
 * here with no Oracle, no Quarkus, no container — plain data in, routed
 * Choice out. (Before the migration this logic lived inline inside
 * `jdbi.inTransaction { ... }` and could only be exercised through the live
 * integration suite.)
 */
class ComparePlannerTest {

    private val syncPk = listOf("id")
    private val types = mapOf("NOTES" to "CLOB", "NAME" to "VARCHAR2")
    private fun typeOf(col: String): String? = types[col]

    @Test
    fun `missing target routes Left as an INSERT diff excluding pk and ignored columns`() {
        val src = mapOf("ID" to 7L, "NAME" to "ann", "AUDIT_TS" to "x", "NOTES" to "n")
        val out = ComparePlanner.diffRow(src, targetRow = null, syncPk,
            ignoreColumns = setOf("audit_ts"), ::typeOf)
        assertTrue(out is Choice.Left)
        val d = (out as Choice.Left).value
        assertEquals("INSERT", d.status)
        assertEquals("7", d.pk)
        assertEquals(mapOf("ID" to "7"), d.pkMap)
        assertEquals(setOf("NAME", "NOTES"), d.changes.map { it.column }.toSet())
        assertTrue(d.changes.all { it.targetValue == "NULL" })
    }

    @Test
    fun `present target with differences routes Right as an UPDATE diff`() {
        val src = mapOf("ID" to 1L, "NAME" to "ann", "NOTES" to "same")
        val tgt = mapOf("ID" to 1L, "NAME" to "bob", "NOTES" to "same")
        val out = ComparePlanner.diffRow(src, tgt, syncPk, emptySet(), ::typeOf)
        assertTrue(out is Choice.Right)
        val d = (out as Choice.Right).value!!
        assertEquals("UPDATE", d.status)
        assertEquals(1, d.changedColumns)
        assertEquals("NAME", d.changes.single().column)
        assertEquals("ann", d.changes.single().sourceValue)
        assertEquals("bob", d.changes.single().targetValue)
    }

    @Test
    fun `identical rows route Right with null - no diff emitted`() {
        val row = mapOf("ID" to 1L, "NAME" to "ann")
        val out = ComparePlanner.diffRow(row, row, syncPk, emptySet(), ::typeOf)
        assertTrue(out is Choice.Right)
        assertNull((out as Choice.Right).value)
    }

    @Test
    fun `HEL-27 clob equality ignores line-ending differences - other types stay exact`() {
        // CLOB: CRLF vs LF vs CR are equal
        assertTrue(ComparePlanner.valuesEqual("a\r\nb", "a\nb", "CLOB"))
        assertTrue(ComparePlanner.valuesEqual("a\rb", "a\nb", "NCLOB"))
        // VARCHAR2: exact comparison — line endings DO differ
        assertFalse(ComparePlanner.valuesEqual("a\r\nb", "a\nb", "VARCHAR2"))
        // null semantics unchanged: null==null, null!=value
        assertTrue(ComparePlanner.valuesEqual(null, null, "CLOB"))
        assertFalse(ComparePlanner.valuesEqual(null, "x", "VARCHAR2"))
        // and end-to-end through the router: a CRLF-only difference is NOT a change
        val src = mapOf("ID" to 1L, "NOTES" to "a\r\nb")
        val tgt = mapOf("ID" to 1L, "NOTES" to "a\nb")
        assertNull((ComparePlanner.diffRow(src, tgt, syncPk, emptySet(), ::typeOf)
            as Choice.Right).value)
    }

    @Test
    fun `rows with missing pk values are identified for skipping`() {
        assertNull(ComparePlanner.pkValuesOrNull(mapOf("ID" to null, "NAME" to "x"), syncPk))
        assertEquals(mapOf("id" to 9L),
            ComparePlanner.pkValuesOrNull(mapOf("ID" to 9L), listOf("id")))
    }

    @Test
    fun `long values are flagged and composite pks render dash-joined`() {
        val long = "x".repeat(101)
        val src = mapOf("A" to 1L, "B" to 2L, "NAME" to long)
        val out = ComparePlanner.diffRow(src, null, listOf("a", "b"), emptySet(), ::typeOf)
        val d = out.fold({ it }, { it!! })
        assertEquals("1-2", d.pk)
        assertTrue(d.changes.single().isLongText)
    }
}
