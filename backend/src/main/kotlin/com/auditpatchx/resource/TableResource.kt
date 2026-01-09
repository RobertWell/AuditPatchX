package com.auditpatchx.resource

import com.auditpatchx.config.AllowlistService
import com.auditpatchx.model.*
import com.auditpatchx.service.DatabaseService
import com.auditpatchx.service.NotFoundException
import jakarta.ws.rs.*
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.slf4j.LoggerFactory

@Path("/api/tables")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
class TableResource(
    private val allowlistService: AllowlistService,
    private val databaseService: DatabaseService
) {
    private val logger = LoggerFactory.getLogger(TableResource::class.java)

    /**
     * GET /api/tables - List all allowed tables
     */
    @GET
    fun listTables(): List<TableInfo> {
        return allowlistService.getAllowedTables().map {
            TableInfo(
                schema = it.schema,
                table = it.table,
                pkColumns = it.pkColumns
            )
        }
    }

    /**
     * POST /api/tables/query - Query table with filters
     */
    @POST
    @Path("/query")
    fun query(request: QueryRequest): Response {
        return try {
            val result = databaseService.query(request)
            Response.ok(result).build()
        } catch (e: SecurityException) {
            logger.error("Security violation in query: ${e.message}")
            Response.status(Response.Status.FORBIDDEN)
                .entity(ErrorResponse("Access denied", e.message))
                .build()
        } catch (e: Exception) {
            logger.error("Query failed", e)
            Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(ErrorResponse("Query failed", e.message))
                .build()
        }
    }

    /**
     * POST /api/tables/get - Get single row by PK
     */
    @POST
    @Path("/get")
    fun getByPk(request: GetByPkRequest): Response {
        return try {
            val result = databaseService.getByPk(request)
            Response.ok(result).build()
        } catch (e: NotFoundException) {
            Response.status(Response.Status.NOT_FOUND)
                .entity(ErrorResponse("Row not found"))
                .build()
        } catch (e: SecurityException) {
            logger.error("Security violation in get: ${e.message}")
            Response.status(Response.Status.FORBIDDEN)
                .entity(ErrorResponse("Access denied", e.message))
                .build()
        } catch (e: Exception) {
            logger.error("Get failed", e)
            Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(ErrorResponse("Get failed", e.message))
                .build()
        }
    }

    /**
     * POST /api/tables/validate-patch - Validate patch before applying
     */
    @POST
    @Path("/validate-patch")
    fun validatePatch(request: ValidatePatchRequest): Response {
        val result = databaseService.validatePatch(request)
        return if (result.ok) {
            Response.ok(result).build()
        } else {
            Response.status(Response.Status.BAD_REQUEST).entity(result).build()
        }
    }

    /**
     * POST /api/tables/update - Apply update (patch)
     */
    @POST
    @Path("/update")
    fun update(request: UpdateRequest): Response {
        return try {
            // Validate reason is provided
            if (request.reason.isBlank()) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(ErrorResponse("Reason is required"))
                    .build()
            }

            val result = databaseService.update(request)
            Response.ok(result).build()
        } catch (e: SecurityException) {
            logger.error("Security violation in update: ${e.message}")
            Response.status(Response.Status.FORBIDDEN)
                .entity(ErrorResponse("Access denied", e.message))
                .build()
        } catch (e: Exception) {
            logger.error("Update failed", e)
            Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(ErrorResponse("Update failed", e.message))
                .build()
        }
    }

    /**
     * GET /api/tables/{schema}/{table}/metadata - Get table metadata
     */
    @GET
    @Path("/{schema}/{table}/metadata")
    fun getMetadata(
        @PathParam("schema") schema: String,
        @PathParam("table") table: String
    ): Response {
        return try {
            val result = databaseService.getTableMetadata(schema, table)
            Response.ok(result).build()
        } catch (e: SecurityException) {
            logger.error("Security violation in metadata: ${e.message}")
            Response.status(Response.Status.FORBIDDEN)
                .entity(ErrorResponse("Access denied", e.message))
                .build()
        } catch (e: Exception) {
            logger.error("Metadata fetch failed", e)
            Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(ErrorResponse("Metadata fetch failed", e.message))
                .build()
        }
    }
}
