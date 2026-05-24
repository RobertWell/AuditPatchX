package com.auditpatchx.auth

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.security.TestSecurity
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

@QuarkusTest
class AuthResourceMockTest {

    @Nested
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
    inner class LogoutTests {

        @Test
        fun `logout returns 200`() {
            given()
                .`when`().post("/api/auth/logout")
                .then()
                .statusCode(200)
        }
    }
}
