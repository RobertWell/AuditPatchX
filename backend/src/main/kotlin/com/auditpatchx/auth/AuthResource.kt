package com.auditpatchx.auth

import io.quarkus.security.Authenticated
import io.quarkus.security.identity.SecurityIdentity
import io.vertx.ext.web.RoutingContext
import jakarta.annotation.security.PermitAll
import jakarta.inject.Inject
import jakarta.ws.rs.*
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.config.inject.ConfigProperty

@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
class AuthResource(
    private val keycloakClient: KeycloakClient,
    @ConfigProperty(name = "auth.mode", defaultValue = "oidc")
    private val authMode: String
) {
    @Inject
    lateinit var identity: SecurityIdentity

    @POST
    @Path("/login")
    @PermitAll
    fun login(request: LoginRequest, @Context rc: RoutingContext): Response {
        if (authMode == "mock") {
            val dummy = "mock.${System.currentTimeMillis()}.token"
            rc.addCookie(TokenRefreshHandler.accessTokenCookie(dummy, 3600))
            rc.addCookie(TokenRefreshHandler.refreshTokenCookie(dummy, 86400))
            return Response.ok(UserInfo("mock-alice", setOf("editor", "viewer"))).build()
        }
        return try {
            val tokens = keycloakClient.login(request.username, request.password)
            rc.addCookie(TokenRefreshHandler.accessTokenCookie(tokens.accessToken, tokens.expiresIn.toLong()))
            rc.addCookie(TokenRefreshHandler.refreshTokenCookie(tokens.refreshToken, tokens.refreshExpiresIn.toLong()))
            Response.ok(UserInfo(request.username, emptySet())).build()
        } catch (e: InvalidCredentialsException) {
            Response.status(401).entity(AuthError("Invalid credentials")).build()
        } catch (e: KeycloakUnavailableException) {
            Response.status(503).entity(AuthError("Auth service unavailable")).build()
        }
    }

    @POST
    @Path("/logout")
    @PermitAll
    fun logout(@Context rc: RoutingContext): Response {
        rc.addCookie(TokenRefreshHandler.accessTokenCookie("", 0))
        rc.addCookie(TokenRefreshHandler.refreshTokenCookie("", 0))
        return Response.ok().build()
    }

    @GET
    @Path("/me")
    @Authenticated
    fun me(): Response =
        Response.ok(UserInfo(identity.principal.name, identity.roles)).build()
}
