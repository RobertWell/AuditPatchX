package com.auditpatchx.config

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithName
import java.util.Optional

@ConfigMapping(prefix = "sync-tables")
interface SyncTableConfig {
    fun pairs(): List<SyncPairConfig>
}

interface SyncPairConfig {
    @WithName("pair-name")
    fun pairName(): String
    fun db(): String
    fun tables(): SyncTablesConfig
    @WithName("pk-columns")
    fun pkColumns(): List<String>
    @WithName("exclude-columns")
    fun excludeColumns(): Optional<List<String>>
}

interface SyncTablesConfig {
    @WithName("table-a")
    fun tableA(): String
    @WithName("table-b")
    fun tableB(): String
}
