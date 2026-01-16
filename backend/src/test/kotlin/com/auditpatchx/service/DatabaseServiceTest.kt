package com.auditpatchx.service

import com.auditpatchx.OracleTestResource
import com.auditpatchx.model.*
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested
import java.math.BigDecimal

@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("DatabaseService Tests")
class DatabaseServiceTest {

    @Inject
    lateinit var databaseService: DatabaseService

    @Nested
    @DisplayName("Query Tests")
    inner class QueryTests {

        @Test
        @DisplayName("Should query all employees without filters")
        fun testQueryAllEmployees() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                limit = 50
            )

            val response = databaseService.query(request)

            assertThat(response.columns).isNotEmpty
            assertThat(response.rows).hasSize(5)
            assertThat(response.columns).contains("EMP_ID", "FIRST_NAME", "LAST_NAME", "EMAIL")
        }

        @Test
        @DisplayName("Should query employees with equality filter")
        fun testQueryWithEqualityFilter() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "FIRST_NAME", op = "eq", value = "John")
                ),
                limit = 50
            )

            val response = databaseService.query(request)

            assertThat(response.rows).hasSize(1)
            assertThat(response.rows[0]["FIRST_NAME"]).isEqualTo("John")
            assertThat(response.rows[0]["LAST_NAME"]).isEqualTo("Doe")
        }

        @Test
        @DisplayName("Should query employees with contains filter")
        fun testQueryWithContainsFilter() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "EMAIL", op = "contains", value = "example.com")
                ),
                limit = 50
            )

            val response = databaseService.query(request)

            assertThat(response.rows).hasSize(5)
            response.rows.forEach { row ->
                assertThat(row["EMAIL"].toString()).contains("example.com")
            }
        }

        @Test
        @DisplayName("Should query employees with startsWith filter")
        fun testQueryWithStartsWithFilter() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "FIRST_NAME", op = "startsWith", value = "J")
                ),
                limit = 50
            )

            val response = databaseService.query(request)

            assertThat(response.rows).hasSize(2) // John and Jane
            response.rows.forEach { row ->
                assertThat(row["FIRST_NAME"].toString()).startsWith("J")
            }
        }

        @Test
        @DisplayName("Should query employees with greater than filter on salary")
        fun testQueryWithGreaterThanFilter() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "SALARY", op = "gt", value = 70000)
                ),
                limit = 50
            )

            val response = databaseService.query(request)

            assertThat(response.rows).hasSize(2) // Employees with salary > 70000 (John: 85000, Jane: 75000)
            response.rows.forEach { row ->
                val salary = (row["SALARY"] as BigDecimal).toDouble()
                assertThat(salary).isGreaterThan(70000.0)
            }
        }

        @Test
        @DisplayName("Should query employees with multiple filters")
        fun testQueryWithMultipleFilters() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "DEPT_ID", op = "eq", value = 1),
                    FilterCondition(col = "SALARY", op = "gte", value = 75000)
                ),
                limit = 50
            )

            val response = databaseService.query(request)

            assertThat(response.rows).hasSize(2) // John and Jane
            response.rows.forEach { row ->
                assertThat(row["DEPT_ID"]).isEqualTo(BigDecimal.valueOf(1))
                val salary = (row["SALARY"] as BigDecimal).toDouble()
                assertThat(salary).isGreaterThanOrEqualTo(75000.0)
            }
        }

        @Test
        @DisplayName("Should respect limit constraint")
        fun testQueryRespectLimit() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                limit = 2
            )

            val response = databaseService.query(request)

            assertThat(response.rows).hasSize(2)
        }

        @Test
        @DisplayName("Should enforce maximum limit of 200")
        fun testQueryMaxLimit() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                limit = 1000 // Try to exceed max
            )

            val response = databaseService.query(request)

            // Should only return available rows (5), but limit is capped at 200
            assertThat(response.rows).hasSizeLessThanOrEqualTo(200)
        }

        @Test
        @DisplayName("Should throw exception for invalid operator")
        fun testQueryInvalidOperator() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                filters = listOf(
                    FilterCondition(col = "FIRST_NAME", op = "invalid", value = "John")
                ),
                limit = 50
            )

            assertThatThrownBy { databaseService.query(request) }
                .isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("Invalid operator")
        }

        @Test
        @DisplayName("Should throw exception for unauthorized table")
        fun testQueryUnauthorizedTable() {
            val request = QueryRequest(
                schema = "TESTUSER",
                table = "UNAUTHORIZED_TABLE",
                limit = 50
            )

            assertThatThrownBy { databaseService.query(request) }
                .isInstanceOf(SecurityException::class.java)
        }
    }

    @Nested
    @DisplayName("GetByPk Tests")
    inner class GetByPkTests {

        @Test
        @DisplayName("Should get employee by primary key")
        fun testGetByPk() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1)
            )

            val response = databaseService.getByPk(request)

            assertThat(response.row).isNotEmpty
            assertThat(response.row["EMP_ID"]).isEqualTo(BigDecimal.valueOf(1))
            assertThat(response.row["FIRST_NAME"]).isEqualTo("John")
            assertThat(response.row["LAST_NAME"]).isEqualTo("Doe")
        }

        @Test
        @DisplayName("Should get job history by composite primary key")
        fun testGetByCompositePk() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "JOB_HISTORY",
                pk = mapOf(
                    "EMPLOYEE_ID" to 2,
                    "START_DATE" to "2020-03-20"
                )
            )

            val response = databaseService.getByPk(request)

            assertThat(response.row).isNotEmpty
            assertThat(response.row["EMPLOYEE_ID"]).isEqualTo(BigDecimal.valueOf(2))
            assertThat(response.row["JOB_TITLE"]).isEqualTo("Junior Developer")
        }

        @Test
        @DisplayName("Should throw NotFoundException for non-existent record")
        fun testGetByPkNotFound() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 999)
            )

            assertThatThrownBy { databaseService.getByPk(request) }
                .isInstanceOf(NotFoundException::class.java)
                .hasMessageContaining("Row not found")
        }

        @Test
        @DisplayName("Should throw exception for invalid PK columns")
        fun testGetByPkInvalidColumns() {
            val request = GetByPkRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("INVALID_COL" to 1)
            )

            assertThatThrownBy { databaseService.getByPk(request) }
                .isInstanceOf(SecurityException::class.java)
        }
    }

    @Nested
    @DisplayName("ValidatePatch Tests")
    inner class ValidatePatchTests {

        @Test
        @DisplayName("Should validate valid patch request")
        fun testValidateValidPatch() {
            val request = ValidatePatchRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("SALARY" to 90000)
            )

            val response = databaseService.validatePatch(request)

            assertThat(response.ok).isTrue()
            assertThat(response.normalizedSet).isEqualTo(request.set)
            assertThat(response.error).isNull()
        }

        @Test
        @DisplayName("Should reject patch with invalid columns")
        fun testValidateInvalidColumns() {
            val request = ValidatePatchRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("INVALID_COLUMN" to "value")
            )

            val response = databaseService.validatePatch(request)

            assertThat(response.ok).isFalse()
            assertThat(response.error).isNotNull()
        }

        @Test
        @DisplayName("Should reject patch attempting to modify PK")
        fun testValidatePatchModifyingPk() {
            val request = ValidatePatchRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("EMP_ID" to 999)
            )

            val response = databaseService.validatePatch(request)

            assertThat(response.ok).isFalse()
            assertThat(response.error).contains("primary key")
        }
    }

    @Nested
    @DisplayName("Update Tests")
    inner class UpdateTests {

        @Test
        @DisplayName("Should update employee salary")
        fun testUpdateEmployeeSalary() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 5),
                set = mapOf("SALARY" to 65000),
                reason = "Annual raise"
            )

            val response = databaseService.update(request)

            assertThat(response.updated).isEqualTo(1)
            assertThat(response.row["SALARY"]).isEqualTo(BigDecimal.valueOf(65000))
        }

        @Test
        @DisplayName("Should update multiple fields")
        fun testUpdateMultipleFields() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 4),
                set = mapOf(
                    "EMAIL" to "alice.updated@example.com",
                    "PHONE" to "555-9999"
                ),
                reason = "Update contact information"
            )

            val response = databaseService.update(request)

            assertThat(response.updated).isEqualTo(1)
            assertThat(response.row["EMAIL"]).isEqualTo("alice.updated@example.com")
            assertThat(response.row["PHONE"]).isEqualTo("555-9999")
        }

        @Test
        @DisplayName("Should update CLOB content beyond 4000 characters")
        fun testUpdateClobContent() {
            val longContent = "word ".repeat(4500).trim()
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 3),
                set = mapOf("BIO" to longContent),
                reason = "Update employee bio"
            )

            val response = databaseService.update(request)

            assertThat(response.updated).isEqualTo(1)
            val bioValue = response.row["BIO"]
            assertThat(bioValue).isInstanceOf(String::class.java)
            assertThat(bioValue as String).hasSize(longContent.length)
        }

        @Test
        @DisplayName("Should return CLOB content as string when fetching by PK")
        fun testGetByPkReturnsClobAsString() {
            val longContent = "clob ".repeat(900).trim()
            databaseService.update(
                UpdateRequest(
                    schema = "TESTUSER",
                    table = "EMPLOYEE",
                    pk = mapOf("EMP_ID" to 2),
                    set = mapOf("BIO" to longContent),
                    reason = "Seed CLOB for fetch"
                )
            )

            val response = databaseService.getByPk(
                GetByPkRequest(
                    schema = "TESTUSER",
                    table = "EMPLOYEE",
                    pk = mapOf("EMP_ID" to 2)
                )
            )

            val bioValue = response.row["BIO"]
            assertThat(bioValue).isInstanceOf(String::class.java)
            assertThat(bioValue as String).isEqualTo(longContent)
        }

        @Test
        @DisplayName("Should throw exception when attempting to update PK")
        fun testUpdatePrimaryKey() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("EMP_ID" to 999),
                reason = "Test"
            )

            assertThatThrownBy { databaseService.update(request) }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("primary key")
        }

        @Test
        @DisplayName("Should throw exception for invalid columns")
        fun testUpdateInvalidColumn() {
            val request = UpdateRequest(
                schema = "TESTUSER",
                table = "EMPLOYEE",
                pk = mapOf("EMP_ID" to 1),
                set = mapOf("INVALID_COLUMN" to "value"),
                reason = "Test"
            )

            assertThatThrownBy { databaseService.update(request) }
                .isInstanceOf(SecurityException::class.java)
        }
    }

    @Nested
    @DisplayName("GetTableMetadata Tests")
    inner class GetTableMetadataTests {

        @Test
        @DisplayName("Should get metadata for EMPLOYEE table")
        fun testGetEmployeeMetadata() {
            val response = databaseService.getTableMetadata("TESTUSER", "EMPLOYEE")

            assertThat(response.pkColumns).containsExactly("EMP_ID")
            assertThat(response.columns).isNotEmpty
            assertThat(response.columns.map { it.name }).contains(
                "EMP_ID", "FIRST_NAME", "LAST_NAME", "EMAIL", "SALARY"
            )
        }

        @Test
        @DisplayName("Should get metadata for DEPARTMENT table")
        fun testGetDepartmentMetadata() {
            val response = databaseService.getTableMetadata("TESTUSER", "DEPARTMENT")

            assertThat(response.pkColumns).containsExactly("DEPT_ID")
            assertThat(response.columns).isNotEmpty
            assertThat(response.columns.map { it.name }).contains(
                "DEPT_ID", "DEPT_NAME", "LOCATION", "BUDGET"
            )
        }

        @Test
        @DisplayName("Should get metadata for table with composite PK")
        fun testGetMetadataCompositePk() {
            val response = databaseService.getTableMetadata("TESTUSER", "JOB_HISTORY")

            assertThat(response.pkColumns).containsExactlyInAnyOrder("EMPLOYEE_ID", "START_DATE")
            assertThat(response.columns).isNotEmpty
        }

        @Test
        @DisplayName("Should include column types and nullability")
        fun testMetadataIncludesTypes() {
            val response = databaseService.getTableMetadata("TESTUSER", "EMPLOYEE")

            val firstNameCol = response.columns.find { it.name == "FIRST_NAME" }
            assertThat(firstNameCol).isNotNull
            assertThat(firstNameCol?.type).isNotEmpty()
            assertThat(firstNameCol?.nullable).isFalse()
        }

        @Test
        @DisplayName("Should throw exception for unauthorized table")
        fun testGetMetadataUnauthorizedTable() {
            assertThatThrownBy {
                databaseService.getTableMetadata("TESTUSER", "UNAUTHORIZED_TABLE")
            }.isInstanceOf(SecurityException::class.java)
        }
    }
}
