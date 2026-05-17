package com.auditpatchx.service

import com.auditpatchx.config.AllowlistService
import com.auditpatchx.config.TableAllowlistConfig
import com.auditpatchx.config.TableConfig
import com.auditpatchx.model.ErrorResponse
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import javax.sql.DataSource

@DisplayName("Security validation unit tests")
class SecurityValidationUnitTest {

    private val securityService = SecurityValidationService(
        dataSource = nullDataSource(),
        allowlistService = AllowlistService(
            object : TableAllowlistConfig {
                override fun tables(): List<TableConfig> = listOf(
                    tableConfig("TESTUSER", "EMPLOYEE", listOf("EMP_ID")),
                    tableConfig("TESTUSER", "JOB_HISTORY", listOf("EMPLOYEE_ID", "START_DATE"))
                )
            }
        )
    )

    @Test
    @DisplayName("Should accept all columns from a composite PK")
    fun testAcceptsCompositePk() {
        securityService.validatePkColumns(
            schema = "TESTUSER",
            table = "JOB_HISTORY",
            pkKeys = setOf("EMPLOYEE_ID", "START_DATE")
        )
    }

    @Test
    @DisplayName("Should reject partial composite PK")
    fun testRejectsPartialCompositePk() {
        assertThatThrownBy {
            securityService.validatePkColumns(
                schema = "TESTUSER",
                table = "JOB_HISTORY",
                pkKeys = setOf("EMPLOYEE_ID")
            )
        }
            .isInstanceOf(SecurityException::class.java)
            .hasMessageContaining("PK mismatch")
    }

    @Test
    @DisplayName("Should reject SQL-shaped identifiers before SQL generation")
    fun testRejectsInjectedIdentifiers() {
        assertThatThrownBy {
            securityService.validateColumns(
                allowedColumns = setOf("EMP_ID", "FIRST_NAME", "BIO"),
                requestedColumns = listOf("BIO FROM TESTUSER.EMPLOYEE --")
            )
        }
            .isInstanceOf(SecurityException::class.java)
            .hasMessageContaining("Invalid columns")
    }

    @Test
    @DisplayName("Should omit sensitive details from sanitized error JSON")
    fun testSanitizedErrorOmitsDetails() {
        val json = jacksonObjectMapper().writeValueAsString(ErrorResponse("Access denied"))

        assertThat(json).contains("Access denied")
        assertThat(json).doesNotContain("details")
    }

    private fun tableConfig(schema: String, table: String, pkColumns: List<String>) =
        object : TableConfig {
            override fun schema(): String = schema
            override fun table(): String = table
            override fun pkColumns(): List<String> = pkColumns
        }

    private fun nullDataSource(): DataSource {
        return object : DataSource {
            override fun getConnection() = throw UnsupportedOperationException("No database needed")
            override fun getConnection(username: String?, password: String?) =
                throw UnsupportedOperationException("No database needed")

            override fun getLogWriter() = null
            override fun setLogWriter(out: java.io.PrintWriter?) = Unit
            override fun setLoginTimeout(seconds: Int) = Unit
            override fun getLoginTimeout(): Int = 0
            override fun getParentLogger(): java.util.logging.Logger = java.util.logging.Logger.getGlobal()
            override fun <T : Any?> unwrap(iface: Class<T>?): T =
                throw UnsupportedOperationException("No database needed")

            override fun isWrapperFor(iface: Class<*>?): Boolean = false
        }
    }
}
