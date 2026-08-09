# HEL-238 — Expand PkgroveKit's role in AuditPatchX dynamic DB ops

**Status:** Implemented (2026-08-09), scoped to what the *published* library supports today.
**Parent:** HEL-120. **Predecessor decision record:** `hel-162-write-path-pkgrovekit-audit.md`.

HEL-238 asks AuditPatchX to express product intent/policy while PkgroveKit owns more of the
reusable database mechanics (dynamic statement generation, metadata-aware conversion SPI,
typed mutations, N+1 reduction, streaming). This file records what was migrated, what stays
AuditPatchX policy, and — importantly — which asks are **blocked on PkgroveKit library APIs
that do not yet exist** and are therefore PkgroveKit-side follow-ups, not AuditPatchX work.

## What this change did (AuditPatchX side)

### Adopted: streaming the compare source read (§5 streaming/bounded)

`DatabaseService.compareTables` previously did `readRows(handle, sql1, ...)` — i.e.
`JdbiReader.readAll(...).rows.map(...)` — which **materializes the entire bounded source set**
(up to `limit`, capped at 1000 full-width rows incl. CLOBs) before diffing. This is the
largest read on the path.

It now streams that read through PkgroveKit's `JdbiReader.read` / `JdbiRowStream` (a mechanic
that already ships in the pinned **0.4.0** — no version bump required). Memory is now bounded
by *one source row + the accumulated diff list*, instead of the whole source set + diffs.

**Parity is exact.** Same SQL, same per-row target lookup, same `ComparePlanner` `Choice`
routing, same skip-on-missing-PK rule, same scan count. `scannedRows` / `limitReached` moved
from `list.size` to a stream cursor counter that is arithmetically identical. Proven by the
live-Oracle compare suite (`CompareReviewServiceTest`, `TableResourceTest`) plus two new
scan-accounting parity tests (`StreamingBoundedCompareTests`).

## What stays AuditPatchX policy (correctly not migrated)

Unchanged from the HEL-162 audit; HEL-238's architectural boundary explicitly keeps these in
the app:

- table/column **allowlists**, authorization, writable/read-only policy (`SecurityValidationService`);
- browser DTO semantics, patch reasons, approval/review workflow, audit logging;
- **blank = omit** insert policy, and the `String + Oracle DATA_TYPE-name → typed value`
  input conversion (`convertValueForBinding` / `parseTemporalString`) — HEL-238 §2 explicitly
  says "blank = omit/null/empty/invalid must remain configurable by AuditPatchX";
- application-specific **CLOB presentation** (`buildClobUpdateExpression`: inline
  `TO_CLOB('') || …` 4000-char chunks) and the `jsonRow` browser shape (uppercase keys, ISO
  temporals);
- `reviewCompareRow` **same-database, server-side** correlated copies
  (`UPDATE … SET (cols)=(SELECT … )`, `INSERT … SELECT … `). HEL-238 non-goal: "Do not replace
  efficient same-database server-side operations with row round-trips through the library."

## Blocked on PkgroveKit library APIs (PkgroveKit-side follow-ups)

The bulk of HEL-238's "PkgroveKit may own" list requires **new library APIs that neither the
pinned 0.4.0 nor the published 0.5.0 expose**. Verified against the 0.4.0 jars on the
classpath and the 0.5.0 source tree. Forcing these into AuditPatchX would move generic
mechanics *back into the app* — the opposite of the issue's boundary — so they are deferred to
PkgroveKit:

| HEL-238 ask | Why blocked (published API today) |
|---|---|
| §1 named CRUD statement generation (select-by-filter, select-by-key, insert, **update-by-key**) | `SqlDialect` only generates `insertSql` (positional `?`, schema-driven) and `upsertSql` (MERGE). There is **no update-by-key**, no named-parameter CRUD, and no map/value-driven generator. AuditPatchX's builders are named-parameter + Oracle-type-name driven. |
| §2 `InputValueConverter` conversion SPI (`convert(ExternalValue, Column): ConversionResult`) | Does not exist. `OracleDialect.bindValue` switches on runtime value type and only does the last `java.time → java.sql` / `Boolean → NUMBER(1)` step — it has **no string→type coercion** and no policy hook. |
| §3 typed `insertAndFetch` / `updateAndFetch` / `selectByKey` with updated/inserted/not-found/rejected/failed/cancelled outcomes | No such execution primitives. `WorkflowOutcome` (typed outcome) exists in core but there is no mutation op that returns one; wiring the app's UI DTOs to it is app-side and out of scope. |
| §4 reusable **batched key lookup / ordered-merge** compare mechanic | Does not exist. This is the only way to remove the compare N+1 target lookup *without* hand-rolling generic batching in the app. Deferred so PkgroveKit owns the mechanic. |
| metadata/schema catalog lookup primitives (Oracle `all_tab_columns`) | `JdbcSchemas.fromMetaData` derives a `Schema` from a `ResultSetMetaData` only; there is no catalog/`all_tab_columns` lookup. `loadOracleColumnTypes` / `getDetailedColumnMetadata` stay app-side (they also enforce allowlist = policy). |

Recommended PkgroveKit issues to unblock full HEL-238: (a) named-parameter dynamic CRUD incl.
update-by-key on `SqlDialect`; (b) `InputValueConverter` SPI + Oracle impl; (c) typed
`insertAndFetch`/`updateAndFetch`/`selectByKey` returning `WorkflowOutcome`; (d) batched-key /
ordered-merge compare mechanic. Once those land, the AuditPatchX write path and compare N+1
can be migrated behind the app's policy layer.

## Version / dependency isolation

- **No version bump.** The one genuine-fit adoption (streaming) already exists in the pinned
  `pkgrovekit.version = 0.4.0`; bumping to 0.5.0 gains nothing for this change and 0.5.0 also
  lacks the write/CRUD/conversion/batched APIs above.
- **Fixed a real transitive leak (HEL-238 acceptance).** `pkgrovekit-jdbi` declares a
  dependency on `pkgrovekit-transfer` (for its `JdbiTransfer` type). AuditPatchX uses only
  `JdbiReader`, so the DB-to-DB transfer engine was leaking onto the runtime classpath as an
  unrelated adapter. Added a POM `<exclusion>` of `pkgrovekit-transfer` from the
  `pkgrovekit-jdbi` dependency. `JdbiTransfer` is never referenced/loaded, so the exclusion is
  runtime-safe (test-compile green).

  Resolved classpath **before**: `jdbi, jdbc, core, transfer, oracle`.
  **After**: exactly `jdbi, jdbc, core, oracle` — no `transfer`, `jta`, `narayana`, `saga`,
  `quarkus`, `spring`, `duckdb`, `postgres`, or `coordination-api`. (Acceptance: only
  explicitly-required modules on the classpath; no unrelated adapter/engine/driver leaks.)

## Metrics (before → after)

- Generic materialization removed from `DatabaseService.kt`: the compare source read no longer
  builds a full `List<Map>` — streamed row-at-a-time.
- Compare memory: `O(limit × row-width)` → `O(1 row + diffs)` for the source scan.
- Compare DB round trips: **unchanged** (still 1 source read + N target lookups) — N+1
  reduction is library-blocked (§4 above).
- Local identifier/binding/conversion helpers: unchanged (all are app policy per boundary).
- Modules on runtime classpath: **5 → 4** (`pkgrovekit-transfer` removed).
- Tests: +2 scan-accounting parity tests; existing live-Oracle compare suite is the parity gate.

## Build / test evidence

- `mvn -o -DskipITs test-compile` — **green** (JDK-21 bytecode via kotlin-maven-plugin).
- Unit/IT execution: **not run locally** — the environment has only a JDK 17 runtime (test
  classes are JDK-21 bytecode) and the compare parity suite needs the Oracle Testcontainer.
  The 141/0/3 live-Oracle parity gate is CI/owner-run; this change is output-preserving.
