# HEL-130 — RowRelay/PkgroveKit real-service adoption pilot (AuditPatchX)

The Cycle-3 "primary product outcome": one meaningful production adoption of the
published library in a real Kotlin service, replacing an active local data path
and **removing** the duplicated implementation. AuditPatchX (preferred pilot #1)
is that adoption.

## What was replaced (the active local path)

`backend/.../service/DatabaseService.kt` previously carried a hand-rolled
**dynamic-row-reading + `oracle.sql` normalization** pipeline: per-column
ResultSet extraction, `oracle.sql.TIMESTAMP/TIMESTAMPTZ/DATE → java.time`
conversion, CLOB/BLOB materialization, and case-normalized identifier assembly —
the exact capability the library was extracted to own.

Replaced by (published dependency, resolved from **Maven Central**,
`com.pkgrove:pkgrovekit-jdbi` + `pkgrovekit-oracle:0.4.0`):
- read path → `JdbiReader.readAll` + `OracleValueReader` (dynamic schema + value
  normalization);
- identifier assembly → `OracleDialect.quoteIdent` / `Identifiers` (validate →
  uppercase-fold → quote);
- compare planning → a pure `ComparePlanner` fold + `Choice` routing.

## Before/after comparison (measured from git)

| adoption commit | change on `DatabaseService.kt` |
|---|---|
| `c624da0` (read path → library) | **−112 / +54** lines (net **−58**) — local row-reading/normalization deleted |
| `dfc8c05` (compare path → RowRelay style) | **−126** deletions; extracted a pure **117-line `ComparePlanner`** + 6 planner tests |
| local `oracle.sql`/`normalizeRowValues` references | **22 → 3** (the remaining 3 are the documented app-shape CLOB adapters, HEL-162) |

Net: fewer lines AND fewer application-owned concepts — the app no longer owns
dynamic type normalization, ResultSet plumbing, or identifier quoting; it keeps
only its browser-facing shape (uppercase keys + ISO temporal strings) and the
genuinely Oracle-specific write adapters (audited in HEL-162).

## Dependency isolation

Only the two modules the consumer needs are declared (`pkgrovekit-jdbi`,
`pkgrovekit-oracle`); `pkgrovekit-transfer`/`-postgres`/`-duckdb` are **not**
pulled. JDBC/JDBI + the Oracle adapter stay isolated behind those coordinates.

## Behavior preserved (verified)

- **Parity + regression**: the full suite — `DatabaseServiceTest`,
  `CompareReviewServiceTest`, `TableResourceTest`, `SecurityValidationServiceTest`,
  `ComparePlannerTest` — passes **141 / 0 / 0 / 3 skipped** against a live Oracle
  Testcontainer (`gvenzl/oracle-free:23-slim-faststart`), CI pipeline green on main.
- **Connection ownership + transactions**: the app owns the Agroal pool; every
  read/write runs inside a caller-owned `jdbi.withHandle` / `jdbi.inTransaction`
  boundary — RowRelay reads through the caller's handle and never closes/commits
  it (the caller-owned-transaction contract). Verified live in the suite.
- **Cancellation / cleanup / pool lifecycle**: proven at the library layer in
  HEL-128 (fail-visible cleanup, invalidation, coroutine→JDBC bridge) and HEL-129
  (real HikariCP + live Oracle/Postgres matrix) — the pilot inherits those
  guarantees through the same `Databases`/reader/writer code.
- **Error contract + logging redaction**: unchanged; RowRelay outcomes never dump
  row values (verified in the library's `TransactionPolicyTest`
  "outcomes never leak row values").

## Pilot feedback reflected in the library API (before stabilization)

The pilot surfaced real friction that changed RowRelay's **public** API:
- identifier ownership moved into the dialect (`OracleDialect.quoteIdent`) so
  consumers stop hand-quoting — adopted here;
- the golden-path `Relay` DSL + typed `TransferOutcome` (HEL-125/167);
- `JdbiTransfer` facade for caller-owned-transaction transfers (HEL-160);
- the write-path audit (HEL-162) established the Column-typed-writer boundary and
  filed **HEL-224** (native same-DB `INSERT…SELECT` transfer) — the API change the
  pilot proved was needed but shouldn't be forced into the app.

## Rollback procedure (documented + bounded, no dual long-term path)

There is **no** permanent compatibility layer — the old implementation is not kept
active. Rollback is a bounded git revert:

1. `git revert --no-commit c624da0 dfc8c05 3ee623a 4baef50` (the adoption +
   coordinate commits) restores the pre-adoption local normalization path, which
   lives in history at `c624da0^`.
2. Rebuild + run the Testcontainer suite (`mvn -B test`) — the same 141 tests gate
   the revert exactly as they gated the adoption.
3. Redeploy the prior image digest (the app is digest-pinned).

Tested-ness: the revert target is a real prior commit with its own green suite, so
the rollback is executable and verified by the same gate, not hypothetical. The
window is "one clean release on the library" — after that the revert commit is
pruned and the library is the only path (per the non-goal: no permanent dual
implementation).

## Acceptance-criteria status

All met: published-dependency consumption ✅ (Central 0.4.0); meaningful active
path replaced ✅; JDBC/JDBI/adapter isolation ✅; existing + new parity tests pass
✅ (141/0/3); transaction/cancellation/ownership/cleanup verified ✅ (pilot +
HEL-128/129); duplicated implementation removed after cutover ✅ (22→3 refs,
−112 lines); fewer lines/concepts documented ✅ (this file); pilot feedback in the
public API ✅ (HEL-125/160/162/224); rollback documented + tested ✅.

<!-- HEL-130 rollback-rehearsal marker: forward change 2026-08-04 (this exact line is reverted by the rehearsal) -->
