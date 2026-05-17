package com.auditpatchx.config

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

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
    fun excludeColumns(): Optional<List<String>>

    fun includeColumns(): Optional<List<String>>
}
