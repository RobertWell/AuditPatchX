package com.auditpatchx.config

import io.quarkus.runtime.annotations.RegisterForReflection
import io.smallrye.config.ConfigMapping
import jakarta.enterprise.context.ApplicationScoped

@ConfigMapping(prefix = "allowlist")
@RegisterForReflection
interface TableAllowlistConfig {
    fun tables(): List<TableConfig>
}

@RegisterForReflection
interface TableConfig {
    fun schema(): String
    fun table(): String
    fun pkColumns(): List<String>
}

@ApplicationScoped
class AllowlistService(
    private val config: TableAllowlistConfig
) {
    private val allowedTables: Map<String, TableConfig> by lazy {
        config.tables().associateBy { "${it.schema()}.${it.table()}".uppercase() }
    }

    fun getAllowedTables(): List<TableConfig> = config.tables()

    fun isTableAllowed(schema: String, table: String): Boolean {
        val key = "$schema.$table".uppercase()
        return allowedTables.containsKey(key)
    }

    fun getTableConfig(schema: String, table: String): TableConfig? {
        val key = "$schema.$table".uppercase()
        return allowedTables[key]
    }
}
