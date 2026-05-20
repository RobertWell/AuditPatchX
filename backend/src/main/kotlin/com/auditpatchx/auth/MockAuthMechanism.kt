package com.auditpatchx.auth

import io.quarkus.security.identity.IdentityProviderManager
import io.quarkus.security.identity.SecurityIdentity
import io.quarkus.security.runtime.QuarkusSecurityIdentity
import io.quarkus.vertx.http.runtime.security.ChallengeData
import io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism
import io.quarkus.vertx.http.runtime.security.HttpCredentialTransport
import io.smallrye.mutiny.Uni
import io.vertx.ext.web.RoutingContext
import jakarta.annotation.Priority
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty

@ApplicationScoped
@Priority(1)
class MockAuthMechanism(
    @ConfigProperty(name = "auth.mode", defaultValue = "oidc")
    private val authMode: String
) : HttpAuthenticationMechanism {

    private val mockIdentity: SecurityIdentity = QuarkusSecurityIdentity.builder()
        .setPrincipal { "mock-alice" }
        .addRoles(setOf("editor", "viewer"))
        .build()

    override fun authenticate(
        context: RoutingContext,
        identityProviderManager: IdentityProviderManager
    ): Uni<SecurityIdentity> {
        if (authMode != "mock") return Uni.createFrom().nullItem()
        return Uni.createFrom().item(mockIdentity)
    }

    override fun getChallenge(context: RoutingContext): Uni<ChallengeData> =
        Uni.createFrom().item(ChallengeData(401, "WWW-Authenticate", "Bearer realm=\"auditpatchx\""))

    override fun getCredentialTypes(): Set<Class<out io.quarkus.security.identity.request.AuthenticationRequest>> =
        emptySet()

    override fun getCredentialTransport(context: RoutingContext): Uni<HttpCredentialTransport> =
        Uni.createFrom().item(
            HttpCredentialTransport(HttpCredentialTransport.Type.COOKIE, "access_token")
        )
}
