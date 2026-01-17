package com.auditpatchx.service

import com.auditpatchx.model.UpdateRequest
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.slf4j.LoggerFactory
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.time.Instant

@ApplicationScoped
class UpdateAuditLogService(
    @ConfigProperty(name = "auditpatchx.update-audit-log.path")
    private val logPath: String,
    private val objectMapper: ObjectMapper
) {
    private val logger = LoggerFactory.getLogger(UpdateAuditLogService::class.java)
    private val lock = Any()

    fun logAttempt(request: UpdateRequest) {
        append(
            UpdateAuditEvent(
                timestamp = Instant.now().toString(),
                status = "attempt",
                schema = request.schema,
                table = request.table,
                pk = request.pk,
                set = request.set,
                reason = request.reason
            )
        )
    }

    fun logSuccess(request: UpdateRequest, updated: Int) {
        append(
            UpdateAuditEvent(
                timestamp = Instant.now().toString(),
                status = "success",
                schema = request.schema,
                table = request.table,
                pk = request.pk,
                set = request.set,
                reason = request.reason,
                updated = updated
            )
        )
    }

    fun logRejected(request: UpdateRequest, message: String) {
        append(
            UpdateAuditEvent(
                timestamp = Instant.now().toString(),
                status = "rejected",
                schema = request.schema,
                table = request.table,
                pk = request.pk,
                set = request.set,
                reason = request.reason,
                error = message
            )
        )
    }

    fun logError(request: UpdateRequest, message: String?) {
        append(
            UpdateAuditEvent(
                timestamp = Instant.now().toString(),
                status = "error",
                schema = request.schema,
                table = request.table,
                pk = request.pk,
                set = request.set,
                reason = request.reason,
                error = message
            )
        )
    }

    private fun append(event: UpdateAuditEvent) {
        val jsonLine = try {
            objectMapper.writeValueAsString(event) + "\n"
        } catch (e: Exception) {
            logger.warn("Failed to serialize update audit log event", e)
            return
        }

        try {
            synchronized(lock) {
                val path = Path.of(logPath)
                path.parent?.let { Files.createDirectories(it) }
                Files.writeString(
                    path,
                    jsonLine,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE,
                    StandardOpenOption.APPEND
                )
            }
        } catch (e: Exception) {
            logger.warn("Failed to write update audit log to path=$logPath", e)
        }
    }

    data class UpdateAuditEvent(
        val timestamp: String,
        val status: String,
        val schema: String,
        val table: String,
        val pk: Map<String, Any>,
        val set: Map<String, Any?>,
        val reason: String,
        val updated: Int? = null,
        val error: String? = null
    )
}

