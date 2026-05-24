package com.auditpatchx.auth

import io.quarkus.security.Authenticated
import io.quarkus.security.identity.SecurityIdentity
import jakarta.annotation.security.PermitAll
import jakarta.inject.Inject
import jakarta.ws.rs.*
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
class AuthResource {

    @Inject
    lateinit var identity: SecurityIdentity

    @GET
    @Path("/me")
    @Authenticated
    fun me(): Response = Response.ok(UserInfo(identity.principal.name, identity.roles)).build()

    // Only reached when auth.mode=mock (quarkus.oidc.enabled=false).
    // In OIDC mode, Quarkus intercepts this path via quarkus.oidc.logout.path
    // and performs RP-initiated logout with Keycloak before the request reaches here.
    @POST
    @Path("/logout")
    @PermitAll
    fun logout(): Response = Response.ok().build()
}
