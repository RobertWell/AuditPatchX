package com.auditpatchx.auth

import com.fasterxml.jackson.annotation.JsonProperty

data class LoginRequest(
    val username: String,
    val password: String
)

data class TokenResponse(
    @JsonProperty("access_token") val accessToken: String,
    @JsonProperty("refresh_token") val refreshToken: String = "",
    @JsonProperty("expires_in") val expiresIn: Int = 60,
    @JsonProperty("refresh_expires_in") val refreshExpiresIn: Int = 1800
)

data class UserInfo(
    val username: String,
    val roles: Set<String>
)

data class AuthError(val error: String)
