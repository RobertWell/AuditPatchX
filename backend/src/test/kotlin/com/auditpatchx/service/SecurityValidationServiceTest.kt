package com.auditpatchx.service

import com.auditpatchx.OracleTestResource
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested

@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("SecurityValidationService Tests")
class SecurityValidationServiceTest {

    @Inject
    lateinit var securityService: SecurityValidationService

    @BeforeEach
    fun setup() {
        // Clear cache before each test to ensure clean state
        securityService.clearCache()
    }

    @Nested
    @DisplayName("ValidateAndGetColumns Tests")
    inner class ValidateAndGetColumnsTests {

        @Test
        @DisplayName("Should return columns for allowed table")
        fun testValidateAllowedTable() {
            val columns = securityService.validateAndGetColumns("TESTUSER", "EMPLOYEE")

            assertThat(columns).isNotEmpty
            assertThat(columns).contains(
                "EMP_ID", "FIRST_NAME", "LAST_NAME", "EMAIL",
                "PHONE", "HIRE_DATE", "SALARY", "DEPT_ID", "MANAGER_ID"
            )
        }

        @Test
        @DisplayName("Should throw SecurityException for non-allowlisted table")
        fun testValidateNonAllowlistedTable() {
            assertThatThrownBy {
                securityService.validateAndGetColumns("TESTUSER", "UNAUTHORIZED_TABLE")
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("not in allowlist")
        }

        @Test
        @DisplayName("Should throw SecurityException for non-existent table")
        fun testValidateNonExistentTable() {
            // First, we need a table that's in the allowlist but doesn't exist
            // For this test, we'll use a table that exists in config but not in DB
            assertThatThrownBy {
                securityService.validateAndGetColumns("NONEXISTENT", "TABLE")
            }
                .isInstanceOf(SecurityException::class.java)
        }

        @Test
        @DisplayName("Should cache column metadata")
        fun testCachingColumnMetadata() {
            // First call - fetches from database
            val columns1 = securityService.validateAndGetColumns("TESTUSER", "EMPLOYEE")

            // Second call - should use cache
            val columns2 = securityService.validateAndGetColumns("TESTUSER", "EMPLOYEE")

            assertThat(columns1).isEqualTo(columns2)
            assertThat(columns1).isSameAs(columns2) // Same instance from cache
        }

        @Test
        @DisplayName("Should handle different schemas")
        fun testDifferentSchemas() {
            val columns = securityService.validateAndGetColumns("TESTUSER", "DEPARTMENT")

            assertThat(columns).isNotEmpty
            assertThat(columns).contains("DEPT_ID", "DEPT_NAME", "LOCATION", "BUDGET")
        }

        @Test
        @DisplayName("Should be case-insensitive")
        fun testCaseInsensitive() {
            val columns1 = securityService.validateAndGetColumns("TESTUSER", "employee")
            val columns2 = securityService.validateAndGetColumns("testuser", "EMPLOYEE")

            assertThat(columns1).isEqualTo(columns2)
        }
    }

    @Nested
    @DisplayName("ValidateColumns Tests")
    inner class ValidateColumnsTests {

        @Test
        @DisplayName("Should accept valid columns")
        fun testValidateValidColumns() {
            val allowedColumns = setOf("EMP_ID", "FIRST_NAME", "LAST_NAME", "EMAIL")
            val requestedColumns = listOf("EMP_ID", "FIRST_NAME")

            // Should not throw
            securityService.validateColumns(allowedColumns, requestedColumns)
        }

        @Test
        @DisplayName("Should throw SecurityException for invalid columns")
        fun testValidateInvalidColumns() {
            val allowedColumns = setOf("EMP_ID", "FIRST_NAME", "LAST_NAME")
            val requestedColumns = listOf("INVALID_COLUMN", "ANOTHER_INVALID")

            assertThatThrownBy {
                securityService.validateColumns(allowedColumns, requestedColumns)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("Invalid columns")
                .hasMessageContaining("INVALID_COLUMN")
        }

        @Test
        @DisplayName("Should be case-insensitive when validating columns")
        fun testValidateColumnsCaseInsensitive() {
            val allowedColumns = setOf("EMP_ID", "FIRST_NAME")
            val requestedColumns = listOf("emp_id", "first_name")

            // Should not throw
            securityService.validateColumns(allowedColumns, requestedColumns)
        }

        @Test
        @DisplayName("Should accept empty requested columns list")
        fun testValidateEmptyColumns() {
            val allowedColumns = setOf("EMP_ID", "FIRST_NAME")
            val requestedColumns = emptyList<String>()

            // Should not throw
            securityService.validateColumns(allowedColumns, requestedColumns)
        }

        @Test
        @DisplayName("Should throw for mix of valid and invalid columns")
        fun testValidateMixedColumns() {
            val allowedColumns = setOf("EMP_ID", "FIRST_NAME")
            val requestedColumns = listOf("EMP_ID", "INVALID_COLUMN")

            assertThatThrownBy {
                securityService.validateColumns(allowedColumns, requestedColumns)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("INVALID_COLUMN")
        }
    }

    @Nested
    @DisplayName("ValidatePkColumns Tests")
    inner class ValidatePkColumnsTests {

        @Test
        @DisplayName("Should accept correct PK columns")
        fun testValidateCorrectPk() {
            val pkKeys = setOf("EMP_ID")

            // Should not throw
            securityService.validatePkColumns("TESTUSER", "EMPLOYEE", pkKeys)
        }

        @Test
        @DisplayName("Should accept composite PK")
        fun testValidateCompositePk() {
            val pkKeys = setOf("EMPLOYEE_ID", "START_DATE")

            // Should not throw
            securityService.validatePkColumns("TESTUSER", "JOB_HISTORY", pkKeys)
        }

        @Test
        @DisplayName("Should throw SecurityException for incorrect PK")
        fun testValidateIncorrectPk() {
            val pkKeys = setOf("WRONG_COLUMN")

            assertThatThrownBy {
                securityService.validatePkColumns("TESTUSER", "EMPLOYEE", pkKeys)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("PK mismatch")
        }

        @Test
        @DisplayName("Should throw SecurityException for incomplete composite PK")
        fun testValidateIncompleteCompositePk() {
            val pkKeys = setOf("EMPLOYEE_ID") // Missing START_DATE

            assertThatThrownBy {
                securityService.validatePkColumns("TESTUSER", "JOB_HISTORY", pkKeys)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("PK mismatch")
        }

        @Test
        @DisplayName("Should be case-insensitive when validating PK")
        fun testValidatePkCaseInsensitive() {
            val pkKeys = setOf("emp_id")

            // Should not throw
            securityService.validatePkColumns("TESTUSER", "EMPLOYEE", pkKeys)
        }

        @Test
        @DisplayName("Should throw for extra PK columns")
        fun testValidateExtraPkColumns() {
            val pkKeys = setOf("EMP_ID", "EXTRA_COLUMN")

            assertThatThrownBy {
                securityService.validatePkColumns("TESTUSER", "EMPLOYEE", pkKeys)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("PK mismatch")
        }
    }

    @Nested
    @DisplayName("ValidateSetColumnsNotPk Tests")
    inner class ValidateSetColumnsNotPkTests {

        @Test
        @DisplayName("Should accept non-PK columns in set")
        fun testValidateNonPkColumns() {
            val setKeys = setOf("FIRST_NAME", "LAST_NAME", "SALARY")

            // Should not throw
            securityService.validateSetColumnsNotPk("TESTUSER", "EMPLOYEE", setKeys)
        }

        @Test
        @DisplayName("Should throw SecurityException when trying to update PK")
        fun testValidateSetContainsPk() {
            val setKeys = setOf("EMP_ID", "FIRST_NAME")

            assertThatThrownBy {
                securityService.validateSetColumnsNotPk("TESTUSER", "EMPLOYEE", setKeys)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("Cannot update PK columns")
                .hasMessageContaining("EMP_ID")
        }

        @Test
        @DisplayName("Should throw when trying to update composite PK column")
        fun testValidateSetContainsCompositePk() {
            val setKeys = setOf("START_DATE", "JOB_TITLE")

            assertThatThrownBy {
                securityService.validateSetColumnsNotPk("TESTUSER", "JOB_HISTORY", setKeys)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("Cannot update PK columns")
                .hasMessageContaining("START_DATE")
        }

        @Test
        @DisplayName("Should be case-insensitive when checking PK")
        fun testValidateSetPkCaseInsensitive() {
            val setKeys = setOf("emp_id")

            assertThatThrownBy {
                securityService.validateSetColumnsNotPk("TESTUSER", "EMPLOYEE", setKeys)
            }
                .isInstanceOf(SecurityException::class.java)
                .hasMessageContaining("Cannot update PK columns")
        }
    }

    @Nested
    @DisplayName("GetDetailedColumnMetadata Tests")
    inner class GetDetailedColumnMetadataTests {

        @Test
        @DisplayName("Should return detailed column metadata")
        fun testGetDetailedMetadata() {
            val columns = securityService.getDetailedColumnMetadata("TESTUSER", "EMPLOYEE")

            assertThat(columns).isNotEmpty
            assertThat(columns).hasSizeGreaterThanOrEqualTo(9) // At least 9 columns

            val empIdColumn = columns.find { it.name == "EMP_ID" }
            assertThat(empIdColumn).isNotNull
            assertThat(empIdColumn?.type).isNotEmpty()
            assertThat(empIdColumn?.nullable).isFalse() // PK is not nullable
        }

        @Test
        @DisplayName("Should include column types")
        fun testMetadataIncludesTypes() {
            val columns = securityService.getDetailedColumnMetadata("TESTUSER", "EMPLOYEE")

            columns.forEach { column ->
                assertThat(column.name).isNotEmpty()
                assertThat(column.type).isNotEmpty()
            }
        }

        @Test
        @DisplayName("Should correctly identify nullable columns")
        fun testMetadataNullability() {
            val columns = securityService.getDetailedColumnMetadata("TESTUSER", "EMPLOYEE")

            val firstNameColumn = columns.find { it.name == "FIRST_NAME" }
            assertThat(firstNameColumn?.nullable).isFalse() // NOT NULL in schema

            val emailColumn = columns.find { it.name == "EMAIL" }
            assertThat(emailColumn?.nullable).isTrue() // Nullable in schema
        }

        @Test
        @DisplayName("Should work for different tables")
        fun testGetDetailedMetadataForDepartment() {
            val columns = securityService.getDetailedColumnMetadata("TESTUSER", "DEPARTMENT")

            assertThat(columns).isNotEmpty
            assertThat(columns.map { it.name }).contains("DEPT_ID", "DEPT_NAME", "LOCATION", "BUDGET")
        }
    }

    @Nested
    @DisplayName("Cache Tests")
    inner class CacheTests {

        @Test
        @DisplayName("Should clear cache")
        fun testClearCache() {
            // Populate cache
            val columns1 = securityService.validateAndGetColumns("TESTUSER", "EMPLOYEE")

            // Clear cache
            securityService.clearCache()

            // Fetch again - should fetch from database
            val columns2 = securityService.validateAndGetColumns("TESTUSER", "EMPLOYEE")

            assertThat(columns1).isEqualTo(columns2)
            assertThat(columns1).isNotSameAs(columns2) // Different instance after cache clear
        }
    }
}
