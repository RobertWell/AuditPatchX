package com.auditpatchx

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager
import org.testcontainers.containers.OracleContainer
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import java.sql.DriverManager
import java.time.Duration

/**
 * Test resource that manages the Oracle database container lifecycle for integration tests.
 * This container is started once and shared across all test classes.
 */
class OracleTestResource : QuarkusTestResourceLifecycleManager {

    companion object {
        private val ORACLE_IMAGE = DockerImageName.parse("gvenzl/oracle-free:23-slim-faststart")
            .asCompatibleSubstituteFor("gvenzl/oracle-xe")
        private var container: OracleContainer? = null
    }

    override fun start(): Map<String, String> {
        // Start Oracle container
        container = OracleContainer(ORACLE_IMAGE)
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test")
            .withReuse(false)
            .withStartupTimeout(Duration.ofMinutes(10))

        container!!.start()

        // Initialize test schema and data
        initializeDatabase()

        // Return configuration for Quarkus - connect as TESTUSER
        return mapOf(
            "quarkus.datasource.db-kind" to "oracle",
            "quarkus.datasource.jdbc.url" to container!!.jdbcUrl,
            "quarkus.datasource.username" to "TESTUSER",
            "quarkus.datasource.password" to "testpass"
        )
    }

    override fun stop() {
        container?.stop()
        container = null
    }

    private fun initializeDatabase() {
        // Connect as SYSTEM user to create TESTUSER
        val systemConnection = DriverManager.getConnection(
            container!!.jdbcUrl,
            "system",
            container!!.password
        )

        systemConnection.use { conn ->
            // Create TESTUSER schema
            executeStatement(conn, "CREATE USER TESTUSER IDENTIFIED BY testpass")
            executeStatement(conn, "GRANT CONNECT, RESOURCE, DBA TO TESTUSER")
            executeStatement(conn, "GRANT UNLIMITED TABLESPACE TO TESTUSER")
        }

        // Connect as TESTUSER to create tables
        val testUserConnection = DriverManager.getConnection(
            container!!.jdbcUrl,
            "TESTUSER",
            "testpass"
        )

        testUserConnection.use { conn ->
            // Read and execute the schema initialization script
            val schemaScript = this::class.java.getResourceAsStream("/test-schema.sql")
                ?.bufferedReader()?.readText()
                ?: throw IllegalStateException("test-schema.sql not found")

            // Parse SQL statements properly, handling multi-line statements and comments
            val statements = parseOracleSqlScript(schemaScript)

            statements.forEach { statement ->
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

    /**
     * Parses Oracle SQL script, properly handling multi-line statements and comments.
     * Statements are delimited by semicolons, but we need to handle:
     * - Multi-line statements (CREATE TABLE with constraints)
     * - Single-line comments starting with --
     * - Empty lines
     */
    private fun parseOracleSqlScript(script: String): List<String> {
        val statements = mutableListOf<String>()
        val currentStatement = StringBuilder()

        script.lines().forEach { line ->
            val trimmedLine = line.trim()

            // Skip empty lines and comment-only lines
            if (trimmedLine.isEmpty() || trimmedLine.startsWith("--")) {
                return@forEach
            }

            // Remove inline comments
            val lineWithoutComment = if (trimmedLine.contains("--")) {
                trimmedLine.substring(0, trimmedLine.indexOf("--")).trim()
            } else {
                trimmedLine
            }

            // Add line to current statement
            if (currentStatement.isNotEmpty()) {
                currentStatement.append(" ")
            }
            currentStatement.append(lineWithoutComment)

            // Check if statement is complete (ends with semicolon)
            if (lineWithoutComment.endsWith(";")) {
                // Remove the semicolon and add the statement
                val statement = currentStatement.toString().dropLast(1).trim()
                if (statement.isNotEmpty()) {
                    statements.add(statement)
                }
                currentStatement.clear()
            }
        }

        // Handle any remaining statement without semicolon
        if (currentStatement.isNotEmpty()) {
            val statement = currentStatement.toString().trim()
            if (statement.isNotEmpty()) {
                statements.add(statement)
            }
        }

        return statements
    }
}
