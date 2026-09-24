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
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.DatabaseMetaData
import java.sql.ResultSet
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

    @Test
    @DisplayName("Should reject readonly columns case-insensitively and accept the rest")
    fun testReadonlyColumns() {
        val readonly = setOf("UPDATED_BY", "UPDATED_AT")

        assertThatThrownBy {
            securityService.validateSetColumnsNotReadonly(setOf("updated_by", "BIO"), readonly)
        }
            .isInstanceOf(SecurityException::class.java)
            .hasMessageContaining("readonly")
            .hasMessageContaining("UPDATED_BY")

        securityService.validateSetColumnsNotReadonly(setOf("BIO", "SALARY"), readonly)
    }

    @Test
    @DisplayName("Should fail closed when the PK of an unconfigured table is validated")
    fun testPkValidationOfUnconfiguredTable() {
        assertThatThrownBy {
            securityService.validatePkColumns("TESTUSER", "DEPARTMENT", setOf("DEPT_ID"))
        }
            .isInstanceOf(SecurityException::class.java)
            .hasMessageContaining("Table configuration not found")
    }

    @Test
    @DisplayName("Should fail closed when the set columns of an unconfigured table are validated")
    fun testSetValidationOfUnconfiguredTable() {
        assertThatThrownBy {
            securityService.validateSetColumnsNotPk("TESTUSER", "DEPARTMENT", setOf("DEPT_NAME"))
        }
            .isInstanceOf(SecurityException::class.java)
            .hasMessageContaining("Table configuration not found")
    }

    @Test
    @DisplayName("Should refuse an allowlisted table whose metadata has no columns")
    fun testAllowlistedTableWithoutColumns() {
        val service = SecurityValidationService(
            dataSource = emptyMetadataDataSource(),
            allowlistService = AllowlistService(
                object : TableAllowlistConfig {
                    override fun tables(): List<TableConfig> =
                        listOf(tableConfig("TESTUSER", "EMPLOYEE", listOf("EMP_ID")))
                }
            )
        )

        assertThatThrownBy { service.validateAndGetColumns("TESTUSER", "EMPLOYEE") }
            .isInstanceOf(SecurityException::class.java)
            .hasMessageContaining("does not exist or has no accessible columns")
    }

    private fun tableConfig(schema: String, table: String, pkColumns: List<String>) =
        object : TableConfig {
            override fun schema(): String = schema
            override fun table(): String = table
            override fun pkColumns(): List<String> = pkColumns
        }

    /**
     * Stubs the exact JDBC surface fetchColumnMetadata touches (JDK dynamic
     * proxies, no mocking library) with a cursor that is empty from the start.
     */
    private fun emptyMetadataDataSource(): DataSource {
        val resultSet = proxy<ResultSet> { method ->
            when (method.name) {
                "next" -> false
                "close" -> null
                else -> throw UnsupportedOperationException("Not stubbed: ${method.name}")
            }
        }
        val metaData = proxy<DatabaseMetaData> { method ->
            when (method.name) {
                "getColumns" -> resultSet
                else -> throw UnsupportedOperationException("Not stubbed: ${method.name}")
            }
        }
        val connection = proxy<Connection> { method ->
            when (method.name) {
                "getMetaData" -> metaData
                "close" -> null
                else -> throw UnsupportedOperationException("Not stubbed: ${method.name}")
            }
        }
        return proxy { method ->
            when (method.name) {
                "getConnection" -> connection
                else -> throw UnsupportedOperationException("Not stubbed: ${method.name}")
            }
        }
    }

    private inline fun <reified T> proxy(crossinline handler: (Method) -> Any?): T =
        Proxy.newProxyInstance(
            T::class.java.classLoader,
            arrayOf(T::class.java),
            InvocationHandler { _, method, _ -> handler(method) }
        ) as T

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
