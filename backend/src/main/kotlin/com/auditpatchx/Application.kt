package com.auditpatchx

import io.quarkus.runtime.Quarkus
import io.quarkus.runtime.QuarkusApplication
import io.quarkus.runtime.annotations.QuarkusMain
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

@QuarkusMain
class Application {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            Quarkus.run(ApplicationMain::class.java, *args)
        }
    }
}

class ApplicationMain : QuarkusApplication {
    override fun run(vararg args: String?): Int {
        Quarkus.waitForExit()
        return 0
    }
}

@Path("/api/health")
@Produces(MediaType.APPLICATION_JSON)
class HealthResource {
    @GET
    fun health(): Map<String, String> {
        return mapOf(
            "status" to "UP",
            "application" to "AuditPatchX Backend"
        )
    }
}
