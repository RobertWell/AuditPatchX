package com.auditpatchx.auth

data class UserInfo(
    val username: String,
    val roles: Set<String>
)
