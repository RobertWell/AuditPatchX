package com.auditpatchx.auth

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

@ApplicationScoped
open class KeycloakClient(
    @ConfigProperty(name = "quarkus.oidc.auth-server-url", defaultValue = "")
    protected open val authServerUrl: String = "",
    @ConfigProperty(name = "quarkus.oidc.client-id", defaultValue = "")
    protected open val clientId: String = "",
    @ConfigProperty(name = "quarkus.oidc.credentials.secret", defaultValue = "")
    protected open val clientSecret: String = ""
) {
    private val mapper = jacksonObjectMapper()

    private val httpClient: HttpClient = HttpClient.newBuilder()
        .sslContext(trustAllSslContext())
        .build()

    open fun login(username: String, password: String): TokenResponse {
        val body = formBody(
            "grant_type" to "password",
            "client_id" to clientId,
            "client_secret" to clientSecret,
            "username" to username,
            "password" to password
        )
        return post(tokenUrl(), body)
    }

    open fun refresh(refreshToken: String): TokenResponse {
        val body = formBody(
            "grant_type" to "refresh_token",
            "client_id" to clientId,
            "client_secret" to clientSecret,
            "refresh_token" to refreshToken
        )
        return post(tokenUrl(), body)
    }

    private fun tokenUrl() = "$authServerUrl/protocol/openid-connect/token"

    private fun post(url: String, body: String): TokenResponse {
        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() == 401 || response.statusCode() == 400) {
            throw InvalidCredentialsException("Keycloak rejected credentials: ${response.statusCode()}")
        }
        if (response.statusCode() != 200) {
            throw KeycloakUnavailableException("Keycloak error: ${response.statusCode()}")
        }
        return mapper.readValue(response.body(), TokenResponse::class.java)
    }

    private fun formBody(vararg pairs: Pair<String, String>): String =
        pairs.joinToString("&") { (k, v) ->
            "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}"
        }

    private fun trustAllSslContext(): SSLContext {
        val trustAll = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }
        return SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustAll), SecureRandom()) }
    }
}

class InvalidCredentialsException(msg: String) : RuntimeException(msg)
class KeycloakUnavailableException(msg: String) : RuntimeException(msg)
