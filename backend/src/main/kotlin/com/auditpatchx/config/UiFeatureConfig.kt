package com.auditpatchx.config

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault

@ConfigMapping(prefix = "ui")
interface UiFeatureConfig {
    fun readonly(): ReadonlyConfig
    fun diffPolicy(): DiffPolicyConfig
}

interface ReadonlyConfig {
    @WithDefault("UPDATED_AT,UPDATED_BY,CREATED_AT,CREATED_BY")
    fun columns(): List<String>
}

interface DiffPolicyConfig {
    @WithDefault("TIMESTAMP,DATE,NUMBER")
    fun excludeTypes(): List<String>

    @WithDefault("")
    fun excludeColumns(): List<String>

    @WithDefault("")
    fun includeColumns(): List<String>
}

