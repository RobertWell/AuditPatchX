package com.auditpatchx.auth

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.security.TestSecurity
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import java.util.Base64

@QuarkusTest
class AuthResourceMockTest {

    @Nested
    inner class IsExpiredTests {
        private val handler = TokenRefreshHandler(
            keycloakClient = object : KeycloakClient() {
                override fun login(username: String, password: String) = throw UnsupportedOperationException()
                override fun refresh(refreshToken: String) = throw UnsupportedOperationException()
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
                .body("username", equalTo("mock-alice"))
                .body("roles", hasItem("editor"))
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
                .body("username", equalTo("mock-alice"))
                .body("roles", hasItem("editor"))
        }
    }

    @Nested
    @DisplayName("Logout endpoint")
    inner class LogoutTests {

        @Test
        fun `logout returns 200 and clears cookies`() {
            given()
                .`when`().post("/api/auth/logout")
                .then()
                .statusCode(200)
        }
    }
}
