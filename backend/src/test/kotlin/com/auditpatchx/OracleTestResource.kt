package com.auditpatchx

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager
import org.testcontainers.containers.OracleContainer
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import java.sql.DriverManager

/**
 * Test resource that manages the Oracle database container lifecycle for integration tests.
 * This container is started once and shared across all test classes.
 */
class OracleTestResource : QuarkusTestResourceLifecycleManager {

    companion object {
        private val ORACLE_IMAGE = DockerImageName.parse("gvenzl/oracle-xe:21-slim-faststart")
        private lateinit var container: OracleContainer
    }

    override fun start(): Map<String, String> {
        // Start Oracle container
        container = OracleContainer(ORACLE_IMAGE)
            .withDatabaseName("XEPDB1")
            .withUsername("test")
            .withPassword("test")
            .withReuse(false)

        container.start()

        // Initialize test schema and data
        initializeDatabase()

        // Return configuration for Quarkus
        return mapOf(
            "quarkus.datasource.jdbc.url" to container.jdbcUrl,
            "quarkus.datasource.username" to container.username,
            "quarkus.datasource.password" to container.password
        )
    }

    override fun stop() {
        if (::container.isInitialized) {
            container.stop()
        }
    }

    private fun initializeDatabase() {
        val connection = DriverManager.getConnection(
            container.jdbcUrl,
            container.username,
            container.password
        )

        connection.use { conn ->
            // Create TESTUSER schema
            executeStatement(conn, "CREATE USER TESTUSER IDENTIFIED BY testpass")
            executeStatement(conn, "GRANT CONNECT, RESOURCE, DBA TO TESTUSER")
            executeStatement(conn, "GRANT UNLIMITED TABLESPACE TO TESTUSER")

            // Read and execute the schema initialization script
            val schemaScript = this::class.java.getResourceAsStream("/test-schema.sql")
                ?.bufferedReader()?.readText()
                ?: throw IllegalStateException("test-schema.sql not found")

            // Split by semicolon and execute each statement
            schemaScript.split(";")
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.startsWith("--") }
                .forEach { statement ->
                    try {
                        executeStatement(conn, statement)
                    } catch (e: Exception) {
                        println("Warning: Failed to execute statement: ${statement.take(100)}")
                        println("Error: ${e.message}")
                    }
                }
        }
    }

    private fun executeStatement(connection: Connection, sql: String) {
        connection.createStatement().use { statement ->
            statement.execute(sql)
        }
    }
}
