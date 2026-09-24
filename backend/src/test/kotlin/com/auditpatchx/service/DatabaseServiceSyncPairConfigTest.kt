package com.auditpatchx.service

import com.auditpatchx.OracleTestResource
import com.auditpatchx.config.AllowlistService
import com.auditpatchx.config.SyncPairConfig
import com.auditpatchx.config.SyncTableConfig
import com.auditpatchx.config.SyncTablesConfig
import com.auditpatchx.config.UiFeatureConfig
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.util.Optional
import javax.sql.DataSource

/**
 * getSyncPairConfigs() against live Oracle metadata. The test application.yml
 * deliberately carries no sync-tables.pairs (SRCFG00050 on fresh CI builds), so
 * the pairs are supplied through a hand-rolled SyncTableConfig and the service
 * is built on the real injected DataSource / security / allowlist / UI config.
 */
@QuarkusTest
@QuarkusTestResource(OracleTestResource::class)
@DisplayName("DatabaseService sync-pair configuration")
class DatabaseServiceSyncPairConfigTest {

    @Inject
    lateinit var dataSource: DataSource

    @Inject
    lateinit var securityService: SecurityValidationService

    @Inject
    lateinit var allowlistService: AllowlistService

    @Inject
    lateinit var uiFeatureConfig: UiFeatureConfig

    private fun serviceWith(vararg pairs: SyncPairConfig) = DatabaseService(
        dataSource,
        securityService,
        allowlistService,
        uiFeatureConfig,
        object : SyncTableConfig {
            override fun pairs(): List<SyncPairConfig> = pairs.toList()
        }
    )

    private fun pair(
        name: String,
        tableA: String,
        tableB: String,
        pk: List<String>,
        exclude: List<String>? = null
    ) = object : SyncPairConfig {
        override fun pairName(): String = name
        override fun db(): String = "AUDIT"
        override fun tables(): SyncTablesConfig = object : SyncTablesConfig {
            override fun tableA(): String = tableA
            override fun tableB(): String = tableB
        }
        override fun pkColumns(): List<String> = pk
        override fun excludeColumns(): Optional<List<String>> = Optional.ofNullable(exclude)
    }

    @Test
    @DisplayName("Each configured pair is reported with upper-cased columns and a live validation")
    fun testPairsAreValidated() {
        val infos = serviceWith(
            pair("employee-mirror", "TESTUSER.EMPLOYEE", "TESTUSER.EMPLOYEE", listOf("emp_id"), listOf("bio", "phone")),
            pair("employee-department", "TESTUSER.EMPLOYEE", "TESTUSER.DEPARTMENT", listOf("emp_id"))
        ).getSyncPairConfigs()

        assertThat(infos).hasSize(2)

        val mirror = infos[0]
        assertThat(mirror.pairName).isEqualTo("employee-mirror")
        assertThat(mirror.db).isEqualTo("AUDIT")
        assertThat(mirror.tableA).isEqualTo("TESTUSER.EMPLOYEE")
        assertThat(mirror.tableB).isEqualTo("TESTUSER.EMPLOYEE")
        assertThat(mirror.pkColumns).containsExactly("EMP_ID")
        assertThat(mirror.excludeColumns).containsExactly("BIO", "PHONE")
        assertThat(mirror.validation).isNotNull
        assertThat(mirror.validation!!.compatible).isTrue()
        assertThat(mirror.validation!!.pkMatch).isTrue()

        val cross = infos[1]
        assertThat(cross.pairName).isEqualTo("employee-department")
        assertThat(cross.excludeColumns).isEmpty()
        assertThat(cross.validation).isNotNull
        assertThat(cross.validation!!.compatible).isFalse()
        assertThat(cross.validation!!.pkMatch).isFalse()
        assertThat(cross.validation!!.details).isEqualTo("Primary key columns do not match between the two tables")
    }

    @Test
    @DisplayName("A pair that cannot be validated is still listed, with validation = null")
    fun testUnvalidatablePairsAreListed() {
        val infos = serviceWith(
            pair("ghost-table", "TESTUSER.EMPLOYEE", "TESTUSER.NO_SUCH_TABLE", listOf("id")),
            pair("malformed-name", "EMPLOYEE", "TESTUSER.EMPLOYEE", listOf("id"))
        ).getSyncPairConfigs()

        assertThat(infos).extracting("pairName").containsExactly("ghost-table", "malformed-name")
        assertThat(infos).allSatisfy { info ->
            assertThat(info.validation).isNull()
            assertThat(info.pkColumns).containsExactly("ID")
        }
    }

    @Test
    @DisplayName("No configured pairs yields an empty list")
    fun testNoPairs() {
        assertThat(serviceWith().getSyncPairConfigs()).isEmpty()
    }
}
