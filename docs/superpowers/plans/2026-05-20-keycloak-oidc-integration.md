# Keycloak OIDC Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect all backend endpoints with Keycloak JWT tokens, add a login/logout flow using httpOnly cookies with transparent server-side token refresh, and provide a `AUTH_MODE=mock` dev mode that skips Keycloak entirely.

**Architecture:** A Vert.x route handler (`TokenRefreshHandler`) runs before Quarkus OIDC on every `/api/*` request — it reads the `access_token` cookie, injects it as `Authorization: Bearer`, and transparently refreshes it via the `refresh_token` cookie if expired. In mock mode (`AUTH_MODE=mock`), a custom `HttpAuthenticationMechanism` returns a hardcoded `SecurityIdentity` and OIDC is disabled, so no Keycloak is needed.

**Tech Stack:** Quarkus 3.6.4, Kotlin, `quarkus-oidc`, `quarkus-test-security`, Vert.x 4.5, Java 17 `java.net.http.HttpClient`, React 18 + TypeScript + Axios (no new npm packages)

**Spec:** `docs/superpowers/specs/2026-05-20-keycloak-oidc-design.md`

---

## File Map

**Create:**
- `scripts/keycloak-setup.sh` — idempotent realm/client/user provisioning
- `backend/src/main/kotlin/com/auditpatchx/auth/AuthModels.kt` — request/response data classes
- `backend/src/main/kotlin/com/auditpatchx/auth/KeycloakClient.kt` — HTTP client for token/refresh calls to Keycloak
- `backend/src/main/kotlin/com/auditpatchx/auth/TokenRefreshHandler.kt` — Vert.x route handler, cookie→Bearer injection + refresh
- `backend/src/main/kotlin/com/auditpatchx/auth/MockAuthMechanism.kt` — custom `HttpAuthenticationMechanism` for mock mode
- `backend/src/main/kotlin/com/auditpatchx/auth/AuthResource.kt` — `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `backend/src/test/kotlin/com/auditpatchx/auth/AuthResourceMockTest.kt` — auth endpoint tests using mock profile
- `frontend/src/hooks/useAuth.ts` — auth state hook
- `frontend/src/components/LoginPage.tsx` — username/password login form

**Modify:**
- `backend/pom.xml` — add `quarkus-oidc`, `quarkus-test-security`
- `backend/src/main/resources/application.yml` — OIDC config
- `backend/src/test/resources/application.yml` — mock mode config for tests
- `backend/src/main/kotlin/com/auditpatchx/resource/TableResource.kt` — add `@Authenticated`
- `backend/src/test/kotlin/com/auditpatchx/resource/TableResourceTest.kt` — add `@TestSecurity`
- `frontend/src/App.tsx` — auth gate wrapping existing app
- `frontend/src/services/api.ts` — add 401 interceptor
- `frontend/.env.development` — add `VITE_AUTH_MODE=mock`
- `frontend/.env.example` — document auth vars
- `backend/.env` — add OIDC vars
- `backend/.env.example` — document OIDC vars

---

## Task 1: Keycloak Realm Provisioning Script

**Files:**
- Create: `scripts/keycloak-setup.sh`

- [ ] **Step 1: Create the scripts directory and write the script**

```bash
mkdir -p scripts
```

`scripts/keycloak-setup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-https://keycloak.local.test}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-aaa123123}"
REALM="auditpatchx"
CLIENT_ID="auditpatchx-app"

echo "=== Authenticating to Keycloak admin ==="
ADMIN_TOKEN=$(curl -sk -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username=$ADMIN_USER&password=$ADMIN_PASS" \
  | jq -r .access_token)

AUTH="Authorization: Bearer $ADMIN_TOKEN"

# ---- Realm ----
echo "=== Creating realm: $REALM ==="
REALM_EXISTS=$(curl -sk -o /dev/null -w "%{http_code}" -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM")
if [ "$REALM_EXISTS" = "200" ]; then
  echo "Realm already exists, updating token lifespan..."
  curl -sk -X PUT "$KEYCLOAK_URL/admin/realms/$REALM" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"accessTokenLifespan":60,"ssoSessionMaxLifespan":1800}'
else
  curl -sk -X POST "$KEYCLOAK_URL/admin/realms" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{
      \"realm\": \"$REALM\",
      \"enabled\": true,
      \"accessTokenLifespan\": 60,
      \"ssoSessionMaxLifespan\": 1800
    }"
  echo "Realm created."
fi

# ---- Client ----
echo "=== Creating client: $CLIENT_ID ==="
CLIENT_EXISTS=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" | jq 'length')
if [ "$CLIENT_EXISTS" -gt "0" ]; then
  echo "Client already exists."
  CLIENT_UUID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" | jq -r '.[0].id')
else
  curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"$CLIENT_ID\",
      \"enabled\": true,
      \"publicClient\": false,
      \"directAccessGrantsEnabled\": true,
      \"standardFlowEnabled\": false,
      \"serviceAccountsEnabled\": false,
      \"redirectUris\": [],
      \"secret\": \"auditpatchx-secret\"
    }"
  CLIENT_UUID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" | jq -r '.[0].id')
  echo "Client created with UUID: $CLIENT_UUID"
fi

# ---- Roles ----
echo "=== Creating roles ==="
for ROLE in viewer editor; do
  ROLE_EXISTS=$(curl -sk -o /dev/null -w "%{http_code}" -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE")
  if [ "$ROLE_EXISTS" != "200" ]; then
    curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/roles" \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d "{\"name\": \"$ROLE\"}"
    echo "Role '$ROLE' created."
  else
    echo "Role '$ROLE' already exists."
  fi
done

# ---- Helper: create user ----
create_user() {
  local USERNAME=$1
  local PASSWORD=$2
  local ROLE=$3

  USER_EXISTS=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" | jq 'length')
  if [ "$USER_EXISTS" -gt "0" ]; then
    echo "User '$USERNAME' already exists."
    USER_UUID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" | jq -r '.[0].id')
  else
    curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d "{
        \"username\": \"$USERNAME\",
        \"enabled\": true,
        \"credentials\": [{\"type\": \"password\", \"value\": \"$PASSWORD\", \"temporary\": false}]
      }"
    USER_UUID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" | jq -r '.[0].id')
    echo "User '$USERNAME' created."
  fi

  ROLE_ID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE" | jq -r .id)
  curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID/role-mappings/realm" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "[{\"id\": \"$ROLE_ID\", \"name\": \"$ROLE\"}]"
  echo "Role '$ROLE' assigned to '$USERNAME'."
}

echo "=== Creating test users ==="
create_user "alice" "alice" "editor"
create_user "bob"   "bob"   "viewer"

echo ""
echo "=== DONE ==="
echo "Realm:         $REALM"
echo "Client ID:     $CLIENT_ID"
echo "Client Secret: auditpatchx-secret"
echo "Token URL:     $KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token"
echo ""
echo "Test login:"
echo "  curl -sk -X POST $KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token \\"
echo "    -d 'grant_type=password&client_id=$CLIENT_ID&client_secret=auditpatchx-secret&username=alice&password=alice' \\"
echo "    | jq -r .access_token"
```

- [ ] **Step 2: Make script executable and run it**

```bash
chmod +x scripts/keycloak-setup.sh
./scripts/keycloak-setup.sh
```

Expected output ends with `=== DONE ===` and the token URL. Verify with the curl test command it prints.

- [ ] **Step 3: Verify a token can be fetched**

```bash
curl -sk -X POST https://keycloak.local.test/realms/auditpatchx/protocol/openid-connect/token \
  -d "grant_type=password&client_id=auditpatchx-app&client_secret=auditpatchx-secret&username=alice&password=alice" \
  | jq '{access_token: .access_token[0:40], expires_in: .expires_in}'
```

Expected: `expires_in: 60` and a non-null token prefix.

- [ ] **Step 4: Commit**

```bash
git add scripts/keycloak-setup.sh
git commit -m "feat: add idempotent Keycloak realm provisioning script"
```

---

## Task 2: Add OIDC Dependencies + Auth Data Models

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/main/kotlin/com/auditpatchx/auth/AuthModels.kt`

- [ ] **Step 1: Add dependencies to `backend/pom.xml`**

Add inside `<dependencies>`, after the existing test dependencies:
```xml
<!-- OIDC -->
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-oidc</artifactId>
</dependency>

<!-- Test security - @TestSecurity annotation -->
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-test-security</artifactId>
    <scope>test</scope>
</dependency>
```

- [ ] **Step 2: Write the test (compile check)**

In `backend/src/test/kotlin/com/auditpatchx/auth/AuthResourceMockTest.kt`, create a stub to verify compilation:
```kotlin
package com.auditpatchx.auth

import io.quarkus.test.junit.QuarkusTest
import org.junit.jupiter.api.Test

// Stub - full tests added in Task 6
@QuarkusTest
class AuthResourceMockTest {
    @Test fun placeholder() {}
}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd backend && ./mvnw compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 4: Create `AuthModels.kt`**

```kotlin
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
```

- [ ] **Step 5: Commit**

```bash
git add backend/pom.xml backend/src/main/kotlin/com/auditpatchx/auth/AuthModels.kt \
        backend/src/test/kotlin/com/auditpatchx/auth/AuthResourceMockTest.kt
git commit -m "feat: add quarkus-oidc dependency and auth data models"
```

---

## Task 3: KeycloakClient

**Files:**
- Create: `backend/src/main/kotlin/com/auditpatchx/auth/KeycloakClient.kt`

- [ ] **Step 1: Create `KeycloakClient.kt`**

```kotlin
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
class KeycloakClient(
    @ConfigProperty(name = "quarkus.oidc.auth-server-url", defaultValue = "")
    private val authServerUrl: String,
    @ConfigProperty(name = "quarkus.oidc.client-id", defaultValue = "")
    private val clientId: String,
    @ConfigProperty(name = "quarkus.oidc.credentials.secret", defaultValue = "")
    private val clientSecret: String
) {
    private val mapper = jacksonObjectMapper()

    // Trust self-signed certs (keycloak.local.test uses self-signed)
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .sslContext(trustAllSslContext())
        .build()

    fun login(username: String, password: String): TokenResponse {
        val body = formBody(
            "grant_type" to "password",
            "client_id" to clientId,
            "client_secret" to clientSecret,
            "username" to username,
            "password" to password
        )
        return post(tokenUrl(), body)
    }

    fun refresh(refreshToken: String): TokenResponse {
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
```

- [ ] **Step 2: Verify compilation**

```bash
cd backend && ./mvnw compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/com/auditpatchx/auth/KeycloakClient.kt
git commit -m "feat: add KeycloakClient for password grant and token refresh"
```

---

## Task 4: TokenRefreshHandler (Vert.x Cookie→Bearer + Auto-Refresh)

**Files:**
- Create: `backend/src/main/kotlin/com/auditpatchx/auth/TokenRefreshHandler.kt`

- [ ] **Step 1: Write `TokenRefreshHandler.kt`**

```kotlin
package com.auditpatchx.auth

import io.vertx.core.http.CookieSameSite
import io.vertx.ext.web.Cookie
import io.vertx.ext.web.Router
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.event.Observes
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.util.Base64
import java.util.concurrent.Callable
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

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

            // Auth endpoints are public — skip
            if (path.startsWith("/api/auth/")) {
                ctx.next()
                return@handler
            }

            // Mock mode — MockAuthMechanism handles identity, no cookie needed
            if (authMode == "mock") {
                ctx.next()
                return@handler
            }

            val accessToken = ctx.request().getCookie("access_token")?.value
            if (accessToken == null) {
                ctx.next()
                return@handler
            }

            if (!isExpired(accessToken)) {
                ctx.request().headers().set("Authorization", "Bearer $accessToken")
                ctx.next()
                return@handler
            }

            // Access token expired — try refresh
            val refreshToken = ctx.request().getCookie("refresh_token")?.value
            if (refreshToken == null) {
                ctx.next()
                return@handler
            }

            ctx.vertx().executeBlocking(Callable {
                keycloakClient.refresh(refreshToken)
            }).onComplete { ar ->
                if (ar.succeeded()) {
                    val tokens = ar.result()
                    ctx.response()
                        .addCookie(accessTokenCookie(tokens.accessToken, tokens.expiresIn.toLong()))
                        .addCookie(refreshTokenCookie(tokens.refreshToken, tokens.refreshExpiresIn.toLong()))
                    ctx.request().headers().set("Authorization", "Bearer ${tokens.accessToken}")
                } else {
                    // Refresh failed — clear cookies, OIDC will return 401
                    ctx.response()
                        .addCookie(accessTokenCookie("", 0))
                        .addCookie(refreshTokenCookie("", 0))
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
```

- [ ] **Step 2: Write unit test for `isExpired()`**

In `backend/src/test/kotlin/com/auditpatchx/auth/AuthResourceMockTest.kt`, replace the placeholder with:
```kotlin
package com.auditpatchx.auth

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.security.TestSecurity
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Nested
import java.util.Base64

@QuarkusTest
class AuthResourceMockTest {

    @Nested
    inner class IsExpiredTests {
        private val handler = TokenRefreshHandler(
            keycloakClient = object : KeycloakClient("", "", "") {
                override fun login(u: String, p: String) = throw UnsupportedOperationException()
                override fun refresh(r: String) = throw UnsupportedOperationException()
            },
            authMode = "mock"
        )

        private fun makeJwt(expSeconds: Long): String {
            val payload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("""{"exp":$expSeconds}""".toByteArray())
            return "header.$payload.sig"
        }

        @Test fun `expired token returns true`() {
            val jwt = makeJwt(System.currentTimeMillis() / 1000 - 120)
            assertThat(handler.isExpired(jwt)).isTrue()
        }

        @Test fun `valid token returns false`() {
            val jwt = makeJwt(System.currentTimeMillis() / 1000 + 300)
            assertThat(handler.isExpired(jwt)).isFalse()
        }

        @Test fun `token within 30s buffer is treated as expired`() {
            val jwt = makeJwt(System.currentTimeMillis() / 1000 + 15)
            assertThat(handler.isExpired(jwt)).isTrue()
        }

        @Test fun `malformed token returns true`() {
            assertThat(handler.isExpired("not.a.jwt")).isTrue()
        }
    }
}
```

Note: `KeycloakClient` constructor parameters need default values to allow this stub in tests. Update `KeycloakClient.kt` — change the class declaration to:
```kotlin
open class KeycloakClient(
    @ConfigProperty(name = "quarkus.oidc.auth-server-url", defaultValue = "") 
    protected val authServerUrl: String = "",
    @ConfigProperty(name = "quarkus.oidc.client-id", defaultValue = "") 
    protected val clientId: String = "",
    @ConfigProperty(name = "quarkus.oidc.credentials.secret", defaultValue = "") 
    protected val clientSecret: String = ""
)
```

And mark `login` and `refresh` as `open`.

- [ ] **Step 3: Run the isExpired tests**

```bash
cd backend && ./mvnw test -pl . -Dtest=AuthResourceMockTest#IsExpiredTests -q 2>&1 | tail -20
```

Expected: `Tests run: 4, Failures: 0, Errors: 0`

- [ ] **Step 4: Verify compilation of the full module**

```bash
cd backend && ./mvnw compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/auditpatchx/auth/TokenRefreshHandler.kt \
        backend/src/main/kotlin/com/auditpatchx/auth/KeycloakClient.kt \
        backend/src/test/kotlin/com/auditpatchx/auth/AuthResourceMockTest.kt
git commit -m "feat: add Vert.x TokenRefreshHandler with cookie-to-Bearer injection"
```

---

## Task 5: MockAuthMechanism

**Files:**
- Create: `backend/src/main/kotlin/com/auditpatchx/auth/MockAuthMechanism.kt`

- [ ] **Step 1: Create `MockAuthMechanism.kt`**

```kotlin
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
        // Auth endpoints are @PermitAll — still need a non-anonymous identity to populate SecurityContext
        return Uni.createFrom().item(mockIdentity)
    }

    override fun getChallenge(context: RoutingContext): Uni<ChallengeData> =
        Uni.createFrom().item(ChallengeData(401, "WWW-Authenticate", "Bearer realm=\"auditpatchx\""))

    override fun getCredentialTypes(): Set<Class<out io.quarkus.security.identity.request.AuthenticationRequest>> =
        emptySet()

    override fun getCredentialTransport(context: RoutingContext): Uni<HttpCredentialTransport> =
        Uni.createFrom().item(HttpCredentialTransport(HttpCredentialTransport.Type.COOKIE, "access_token"))
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd backend && ./mvnw compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/com/auditpatchx/auth/MockAuthMechanism.kt
git commit -m "feat: add MockAuthMechanism for auth.mode=mock dev mode"
```

---

## Task 6: AuthResource (Login / Logout / Me) + OIDC Config

**Files:**
- Create: `backend/src/main/kotlin/com/auditpatchx/auth/AuthResource.kt`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/test/resources/application.yml`
- Modify: `backend/.env` and `backend/.env.example`

- [ ] **Step 1: Write failing tests in `AuthResourceMockTest.kt`**

Add these nested classes to `AuthResourceMockTest.kt` (inside the class body, after `IsExpiredTests`):

```kotlin
    @Nested
    @DisplayName("Login endpoint")
    inner class LoginTests {

        @Test
        fun `mock login returns 200 and sets cookies`() {
            given()
                .contentType(ContentType.JSON)
                .body("""{"username":"alice","password":"alice"}""")
                .`when`().post("/api/auth/login")
                .then()
                .statusCode(200)
                .cookie("access_token")
                .cookie("refresh_token")
                .body("username", org.hamcrest.Matchers.equalTo("mock-alice"))
                .body("roles", org.hamcrest.Matchers.hasItem("editor"))
        }

        @Test
        fun `mock login returns 200 regardless of credentials`() {
            given()
                .contentType(ContentType.JSON)
                .body("""{"username":"anyone","password":"any"}""")
                .`when`().post("/api/auth/login")
                .then()
                .statusCode(200)
        }
    }

    @Nested
    @DisplayName("Me endpoint")
    inner class MeTests {

        @Test
        @TestSecurity(user = "mock-alice", roles = ["editor", "viewer"])
        fun `me returns current user identity`() {
            given()
                .`when`().get("/api/auth/me")
                .then()
                .statusCode(200)
                .body("username", org.hamcrest.Matchers.equalTo("mock-alice"))
                .body("roles", org.hamcrest.Matchers.hasItem("editor"))
        }
    }

    @Nested
    @DisplayName("Logout endpoint")
    inner class LogoutTests {

        @Test
        fun `logout clears cookies`() {
            given()
                .`when`().post("/api/auth/logout")
                .then()
                .statusCode(200)
        }
    }
```

Also add `import org.junit.jupiter.api.DisplayName` and the hamcrest imports at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && ./mvnw test -Dtest=AuthResourceMockTest -q 2>&1 | tail -10
```

Expected: tests fail with 404 (endpoints don't exist yet).

- [ ] **Step 3: Create `AuthResource.kt`**

```kotlin
package com.auditpatchx.auth

import io.quarkus.security.Authenticated
import io.quarkus.security.identity.SecurityIdentity
import jakarta.annotation.security.PermitAll
import jakarta.ws.rs.*
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.config.inject.ConfigProperty

@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
class AuthResource(
    private val keycloakClient: KeycloakClient,
    private val identity: SecurityIdentity,
    @ConfigProperty(name = "auth.mode", defaultValue = "oidc")
    private val authMode: String
) {
    @POST
    @Path("/login")
    @PermitAll
    fun login(request: LoginRequest): Response {
        return if (authMode == "mock") {
            val mockUser = UserInfo(username = "mock-alice", roles = setOf("editor", "viewer"))
            val resp = Response.ok(mockUser)
                .cookie(jakarta.ws.rs.core.NewCookie.Builder("access_token")
                    .value("mock-token")
                    .httpOnly(true)
                    .path("/api")
                    .maxAge(3600)
                    .build())
                .cookie(jakarta.ws.rs.core.NewCookie.Builder("refresh_token")
                    .value("mock-refresh")
                    .httpOnly(true)
                    .path("/api")
                    .maxAge(86400)
                    .build())
                .build()
            resp
        } else {
            try {
                val tokens = keycloakClient.login(request.username, request.password)
                // Extract username from JWT payload
                val username = extractUsername(tokens.accessToken) ?: request.username
                val roles = extractRoles(tokens.accessToken)
                val user = UserInfo(username = username, roles = roles)
                Response.ok(user)
                    .cookie(jakarta.ws.rs.core.NewCookie.Builder("access_token")
                        .value(tokens.accessToken)
                        .httpOnly(true)
                        .path("/api")
                        .maxAge(tokens.expiresIn)
                        .build())
                    .cookie(jakarta.ws.rs.core.NewCookie.Builder("refresh_token")
                        .value(tokens.refreshToken)
                        .httpOnly(true)
                        .path("/api")
                        .maxAge(tokens.refreshExpiresIn)
                        .build())
                    .build()
            } catch (e: InvalidCredentialsException) {
                Response.status(401)
                    .entity(AuthError("invalid-credentials"))
                    .build()
            } catch (e: KeycloakUnavailableException) {
                Response.status(502)
                    .entity(AuthError("auth-service-unavailable"))
                    .build()
            }
        }
    }

    @POST
    @Path("/logout")
    @PermitAll
    fun logout(): Response {
        return Response.ok()
            .cookie(jakarta.ws.rs.core.NewCookie.Builder("access_token")
                .value("").httpOnly(true).path("/api").maxAge(0).build())
            .cookie(jakarta.ws.rs.core.NewCookie.Builder("refresh_token")
                .value("").httpOnly(true).path("/api").maxAge(0).build())
            .build()
    }

    @GET
    @Path("/me")
    @Authenticated
    fun me(): UserInfo {
        val roles = identity.roles
        return UserInfo(
            username = identity.principal.name,
            roles = roles
        )
    }

    private fun extractUsername(token: String): String? = try {
        val payload = token.split(".").getOrElse(1) { return null }
        val padded = payload + "=".repeat((4 - payload.length % 4) % 4)
        val json = String(java.util.Base64.getUrlDecoder().decode(padded))
        com.fasterxml.jackson.module.kotlin.jacksonObjectMapper().readTree(json)
            .let { it["preferred_username"] ?: it["sub"] }?.asText()
    } catch (e: Exception) { null }

    private fun extractRoles(token: String): Set<String> = try {
        val payload = token.split(".").getOrElse(1) { return emptySet() }
        val padded = payload + "=".repeat((4 - payload.length % 4) % 4)
        val json = String(java.util.Base64.getUrlDecoder().decode(padded))
        val tree = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper().readTree(json)
        tree["realm_access"]?.get("roles")?.map { it.asText() }?.toSet() ?: emptySet()
    } catch (e: Exception) { emptySet() }
}
```

- [ ] **Step 4: Add OIDC config to `backend/src/main/resources/application.yml`**

Add after the `http:` block:
```yaml
  oidc:
    enabled: ${OIDC_ENABLED:true}
    auth-server-url: ${OIDC_AUTH_SERVER_URL:https://keycloak.local.test/realms/auditpatchx}
    client-id: ${OIDC_CLIENT_ID:auditpatchx-app}
    credentials:
      secret: ${OIDC_CLIENT_SECRET:auditpatchx-secret}
    application-type: service
    tls:
      verification: none
```

- [ ] **Step 5: Add mock config to `backend/src/test/resources/application.yml`**

Add after the `http:` block:
```yaml
  oidc:
    enabled: false
    auth-server-url: https://keycloak.local.test/realms/auditpatchx
    client-id: auditpatchx-app
    credentials:
      secret: auditpatchx-secret
    application-type: service
    tls:
      verification: none

auth:
  mode: mock
```

- [ ] **Step 6: Update `backend/.env` and `backend/.env.example`**

Add to `backend/.env`:
```
# OIDC Configuration
OIDC_ENABLED=true
OIDC_AUTH_SERVER_URL=https://keycloak.local.test/realms/auditpatchx
OIDC_CLIENT_ID=auditpatchx-app
OIDC_CLIENT_SECRET=auditpatchx-secret
AUTH_MODE=oidc
```

Add to `backend/.env.example`:
```
# OIDC Configuration
OIDC_ENABLED=true
OIDC_AUTH_SERVER_URL=https://keycloak.local.test/realms/auditpatchx
OIDC_CLIENT_ID=auditpatchx-app
OIDC_CLIENT_SECRET=<client-secret-from-keycloak-setup.sh>
# Set AUTH_MODE=mock and OIDC_ENABLED=false for local dev without Keycloak
AUTH_MODE=oidc
```

- [ ] **Step 7: Run the auth tests**

```bash
cd backend && ./mvnw test -Dtest=AuthResourceMockTest -q 2>&1 | tail -15
```

Expected: `Tests run: 6, Failures: 0, Errors: 0`

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/kotlin/com/auditpatchx/auth/AuthResource.kt \
        backend/src/main/resources/application.yml \
        backend/src/test/resources/application.yml \
        backend/src/test/kotlin/com/auditpatchx/auth/AuthResourceMockTest.kt \
        backend/.env.example
git commit -m "feat: add AuthResource login/logout/me with mock and OIDC modes"
```

---

## Task 7: Secure TableResource + Update Existing Tests

**Files:**
- Modify: `backend/src/main/kotlin/com/auditpatchx/resource/TableResource.kt`
- Modify: `backend/src/test/kotlin/com/auditpatchx/resource/TableResourceTest.kt`

- [ ] **Step 1: Add `@Authenticated` to `TableResource.kt`**

Add `import io.quarkus.security.Authenticated` and annotate the class:

```kotlin
import io.quarkus.security.Authenticated

@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated                          // ← add this line
class TableResource(
```

- [ ] **Step 2: Run existing tests before fix — verify they now fail with 401**

```bash
cd backend && ./mvnw test -Dtest=TableResourceTest -q 2>&1 | tail -10
```

Expected: tests fail (401 Unauthorized on all endpoints).

- [ ] **Step 3: Add `@TestSecurity` to `TableResourceTest.kt`**

Add imports and annotation to the test class:
```kotlin
import io.quarkus.test.security.TestSecurity

@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@TestSecurity(user = "test-alice", roles = ["editor", "viewer"])   // ← add this
@DisplayName("TableResource API Tests")
class TableResourceTest {
```

- [ ] **Step 4: Run existing tests to verify they pass again**

```bash
cd backend && ./mvnw test -Dtest=TableResourceTest -q 2>&1 | tail -10
```

Expected: all tests pass as before.

- [ ] **Step 5: Run full test suite**

```bash
cd backend && ./mvnw test -q 2>&1 | tail -15
```

Expected: `BUILD SUCCESS`, zero failures.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/auditpatchx/resource/TableResource.kt \
        backend/src/test/kotlin/com/auditpatchx/resource/TableResourceTest.kt
git commit -m "feat: protect all TableResource endpoints with @Authenticated"
```

---

## Task 8: Frontend `useAuth` Hook

**Files:**
- Create: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useAuth.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export interface AuthUser {
  username: string;
  roles: string[];
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const MOCK_MODE = import.meta.env.VITE_AUTH_MODE === 'mock';
const MOCK_USER: AuthUser = { username: 'mock-alice', roles: ['editor', 'viewer'] };

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (MOCK_MODE) {
      setUser(MOCK_USER);
      setChecked(true);
      return;
    }
    // Rehydrate session on page load
    axios.get<AuthUser>('/api/auth/me')
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (MOCK_MODE) {
      setUser(MOCK_USER);
      return;
    }
    const res = await axios.post<AuthUser>('/api/auth/login', { username, password });
    setUser(res.data);
  }, []);

  const logout = useCallback(async () => {
    if (MOCK_MODE) {
      setUser(null);
      return;
    }
    await axios.post('/api/auth/logout');
    setUser(null);
  }, []);

  return {
    isAuthenticated: !!user && checked,
    user,
    login,
    logout,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useAuth.ts
git commit -m "feat: add useAuth hook with mock and OIDC modes"
```

---

## Task 9: Frontend LoginPage Component

**Files:**
- Create: `frontend/src/components/LoginPage.tsx`

- [ ] **Step 1: Create `frontend/src/components/LoginPage.tsx`**

```tsx
import { useState } from 'react';
import { AuthState } from '../hooks/useAuth';

interface Props {
  auth: AuthState;
}

export function LoginPage({ auth }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.login(username, password);
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      if (msg === 'invalid-credentials') {
        setError('Invalid username or password.');
      } else if (msg === 'auth-service-unavailable') {
        setError('Authentication service is unavailable. Try again later.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-sm p-8 rounded-lg border border-border shadow-sm bg-card">
        <h1 className="text-2xl font-bold mb-6 text-center">AuditPatchX</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LoginPage.tsx
git commit -m "feat: add LoginPage component"
```

---

## Task 10: Frontend Auth Gate (App.tsx) + 401 Interceptor (api.ts)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/.env.development`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Add 401 interceptor to `frontend/src/services/api.ts`**

After the `const apiBaseUrl = ...` line (line 92), and before `export const apiClient`, add:

```typescript
// Track auth state callback — set by App on mount
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(cb: () => void) { onUnauthorized = cb; }

// 401 interceptor — clears auth state, App shows LoginPage
axios.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(err);
  }
);
```

Add `import axios from 'axios';` at the top if not already present (it is, from the AxiosInstance import).

- [ ] **Step 2: Wire auth gate into `frontend/src/App.tsx`**

At the top of `App.tsx`, add imports:
```typescript
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/LoginPage';
import { setUnauthorizedHandler } from './services/api';
```

Inside `function App()`, before the existing state declarations, add:
```typescript
  const auth = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Force re-check by clearing the user — useAuth will set isAuthenticated=false
      // A full page reload also works and is simpler for edge cases
      window.location.reload();
    });
  }, []);
```

Wrap the final `return` statement:
```typescript
  // Show login page until auth is resolved
  if (!auth.isAuthenticated) {
    return <LoginPage auth={auth} />;
  }

  return (
    // ... existing return content unchanged
  );
```

- [ ] **Step 3: Update `frontend/.env.development`**

```
FAST_REFRESH=false
VITE_API_URL=/api
VITE_AUTH_MODE=mock
```

- [ ] **Step 4: Update `frontend/.env.example`**

```
FAST_REFRESH=false
VITE_API_URL=/api
# Set to 'mock' for local dev without Keycloak. Backend must also run with AUTH_MODE=mock.
VITE_AUTH_MODE=mock
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && npm test 2>&1 | tail -15
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/services/api.ts \
        frontend/.env.development frontend/.env.example
git commit -m "feat: add auth gate to App and 401 interceptor to ApiClient"
```

---

## Task 11: Integration Verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && ./mvnw test -q 2>&1 | tail -15
```

Expected: `BUILD SUCCESS`, zero failures.

- [ ] **Step 2: Start backend with mock mode and verify login**

```bash
cd backend
AUTH_MODE=mock OIDC_ENABLED=false \
  DB_URL=jdbc:oracle:thin:@//172.17.0.2:1521/XEPDB1 DB_USER=TRDMGMR DB_PASSWORD=mypassword \
  ./mvnw quarkus:dev -q &

sleep 10

curl -s -c /tmp/cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"anyone","password":"any"}' | jq .
```

Expected: `{"username":"mock-alice","roles":["editor","viewer"]}`

- [ ] **Step 3: Verify protected endpoint works with mock cookie**

```bash
curl -s -b /tmp/cookies.txt http://localhost:8080/api/tables | jq 'length'
```

Expected: a number (list of tables), not a 401.

- [ ] **Step 4: Kill the dev server, start with real OIDC and test token refresh**

```bash
pkill -f "quarkus:dev" 2>/dev/null; sleep 3

cd backend
DB_URL=jdbc:oracle:thin:@//172.17.0.2:1521/XEPDB1 DB_USER=TRDMGMR DB_PASSWORD=mypassword \
  ./mvnw quarkus:dev -q &

sleep 15

# Login — gets a 60-second access token
curl -s -c /tmp/real-cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"alice"}' | jq '{username, roles}'
```

Expected: `{"username":"alice","roles":["editor"]}`

- [ ] **Step 5: Wait for token expiry and verify transparent refresh**

```bash
echo "Waiting 75 seconds for access token to expire..."
sleep 75

# This call triggers the refresh inside TokenRefreshHandler — no 401
curl -s -b /tmp/real-cookies.txt -c /tmp/real-cookies.txt \
  http://localhost:8080/api/tables | jq 'length'
```

Expected: returns table list (not 401). Check that `Set-Cookie: access_token=...` appears in response headers:

```bash
curl -sv -b /tmp/real-cookies.txt http://localhost:8080/api/tables 2>&1 | grep -i "set-cookie"
```

Expected: `Set-Cookie: access_token=<new-token>` in response.

- [ ] **Step 6: Kill dev server**

```bash
pkill -f "quarkus:dev" 2>/dev/null
```

- [ ] **Step 7: Final commit**

```bash
git add backend/.env
git commit -m "chore: add OIDC env vars to backend .env"
```

---

## Summary

| Task | Deliverable |
|---|---|
| 1 | `scripts/keycloak-setup.sh` — realm `auditpatchx`, 60s tokens, alice/bob users |
| 2 | `quarkus-oidc` + `quarkus-test-security` in pom, `AuthModels.kt` |
| 3 | `KeycloakClient.kt` — password grant + refresh via Java 17 HttpClient |
| 4 | `TokenRefreshHandler.kt` — Vert.x route handler, cookie→Bearer, auto-refresh |
| 5 | `MockAuthMechanism.kt` — hardcoded identity when `AUTH_MODE=mock` |
| 6 | `AuthResource.kt` — login/logout/me, mock+oidc branches, tests pass |
| 7 | `TableResource` protected with `@Authenticated`, existing tests updated |
| 8 | `useAuth.ts` — hook with mock/real modes |
| 9 | `LoginPage.tsx` — login form |
| 10 | `App.tsx` auth gate + `api.ts` 401 interceptor |
| 11 | Manual integration: mock mode works + 60s token refresh verified |
