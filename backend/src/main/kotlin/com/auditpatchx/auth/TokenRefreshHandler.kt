package com.auditpatchx.auth

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.vertx.core.http.Cookie
import io.vertx.core.http.CookieSameSite
import io.vertx.ext.web.Router
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.event.Observes
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.util.Base64
import java.util.concurrent.Callable

@ApplicationScoped
class TokenRefreshHandler(
    private val keycloakClient: KeycloakClient,
    @ConfigProperty(name = "auth.mode", defaultValue = "oidc")
    private val authMode: String
) {
    private val mapper = jacksonObjectMapper()

    fun init(@Observes router: Router) {
        router.route("/api/*").order(-10).handler { ctx ->
            val path = ctx.request().path()

            if (path.startsWith("/api/auth/")) {
                ctx.next()
                return@handler
            }

            if (authMode == "mock") {
                ctx.next()
                return@handler
            }

            val accessToken = ctx.getCookie("access_token")?.value
            if (accessToken == null) {
                ctx.next()
                return@handler
            }

            if (!isExpired(accessToken)) {
                ctx.request().headers().set("Authorization", "Bearer $accessToken")
                ctx.next()
                return@handler
            }

            val refreshToken = ctx.getCookie("refresh_token")?.value
            if (refreshToken == null) {
                ctx.next()
                return@handler
            }

            ctx.vertx().executeBlocking(Callable {
                keycloakClient.refresh(refreshToken)
            }).onComplete { ar ->
                if (ar.succeeded()) {
                    val tokens = ar.result()
                    ctx.addCookie(accessTokenCookie(tokens.accessToken, tokens.expiresIn.toLong()))
                    ctx.addCookie(refreshTokenCookie(tokens.refreshToken, tokens.refreshExpiresIn.toLong()))
                    ctx.request().headers().set("Authorization", "Bearer ${tokens.accessToken}")
                } else {
                    ctx.addCookie(accessTokenCookie("", 0))
                    ctx.addCookie(refreshTokenCookie("", 0))
                }
                ctx.next()
            }
        }
    }

    internal fun isExpired(token: String): Boolean {
        return try {
            val payload = token.split(".").getOrElse(1) { return true }
            val padded = payload + "=".repeat((4 - payload.length % 4) % 4)
            val json = String(Base64.getUrlDecoder().decode(padded))
            val exp = mapper.readTree(json)["exp"]?.asLong() ?: return true
            System.currentTimeMillis() / 1000 > exp - 30
        } catch (e: Exception) {
            true
        }
    }

    companion object {
        fun accessTokenCookie(value: String, maxAge: Long): Cookie =
            Cookie.cookie("access_token", value)
                .setHttpOnly(true)
                .setPath("/api")
                .setSameSite(CookieSameSite.LAX)
                .setMaxAge(maxAge)

        fun refreshTokenCookie(value: String, maxAge: Long): Cookie =
            Cookie.cookie("refresh_token", value)
                .setHttpOnly(true)
                .setPath("/api")
                .setSameSite(CookieSameSite.LAX)
                .setMaxAge(maxAge)
    }
}
