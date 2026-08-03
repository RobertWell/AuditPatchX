# HEL-162 — AuditPatchX write/compare path × PkgroveKit: audit conclusion

**Status:** Audited (2026-08-03). **Outcome:** the clean, semantics-preserving migrations
are already done; the *remaining* write path stays as documented Oracle app-shape adapters
because routing it through PkgroveKit is either impossible or a regression. This file is the
decision record so the boundary isn't re-litigated.

HEL-162 was filed as `NEED_AUDIT` — "proposal, not an implementation commitment." The audit
below is the deliverable: it corrects the issue's premise with evidence and fixes the
PkgroveKit-vs-app boundary in place.

## What PkgroveKit already owns in this service (done, keep delegating)

- **Identifier quoting** — `DatabaseService.ident()/qualified()` delegate to
  `OracleDialect.quoteIdent` (→ `Identifiers.validate`, the allowlist `^[A-Za-z_]…`), and
  `OracleDialect.identifierCase` is the `.uppercase()` fold. No raw identifier interpolation
  remains in SQL (only in app-side type-map *lookup keys*, which never reach SQL).
- **Read path** — `readRows()` → `JdbiReader.readAll` + `OracleValueReader` (HEL-120 pilot).
- **Compare planning** — the diff is a pure `ComparePlanner` fold over read rows with
  `Choice` routing (HEL-162 groundwork, commit `dfc8c05`).

## What stays app-shape, and why PkgroveKit can't take it (the audit answer)

The write helpers start from **browser input: a `String` value + an Oracle `DATA_TYPE`
name**. PkgroveKit's write API is **`Column`-typed** — it binds already-typed values against a
discovered `Schema`. That impedance mismatch is the root reason the rest doesn't delegate.

| Helper | Why it stays |
|---|---|
| `convertValueForBinding` (String→BigDecimal for `NUMBER/INTEGER/FLOAT`; String→`java.time`/`Timestamp` for `DATE`/`TIMESTAMP`) | PkgroveKit has **no string→type coercion** — `OracleDialect.bindValue` switches on the *runtime value type*, not a type-name string, and only does the final `LocalDateTime→Timestamp`/`Boolean→1/0` step. The app's job is precisely the string-parsing PkgroveKit deliberately doesn't do. (PkgroveKit's `bindValue` comment even notes it "matches the AuditPatchX binding fix" — they already converge on the last step; only the parsing is app-specific.) |
| `parseTemporalString` / `ParsedTemporal` | Same — multi-format ISO/space-separated string parsing off browser input. No PkgroveKit equivalent. |
| `buildClobUpdateExpression` (`TO_CLOB('') \|\| '…'` in 4000-char chunks, `''`-escaped, as **inline SQL text**) | PkgroveKit binds CLOB as a **parameter** (`typeFor→CLOB`); it has no "CLOB-as-concatenated-literal" builder. Switching to param-bound CLOB is a behavior change, out of scope. |
| `update()` — `UPDATE … SET … WHERE pk` | PkgroveKit generates only `insertSql`/`upsertSql` (MERGE). There is **no generated UPDATE-by-PK**. Forcing MERGE changes semantics: MERGE inserts-or-updates and would not surface the app's strict "row must exist" assertion. |
| `reviewCompareRow()` — correlated `UPDATE tgt SET (cols)=(SELECT cols FROM src WHERE …)` and `INSERT INTO tgt (cols) SELECT cols FROM src WHERE …` | These are **same-database, server-side row copies** — values never leave Oracle. PkgroveKit's model is read-rows-into-memory-then-batch-write, which for this path would (a) pull every column (incl. large CLOBs) through the app, (b) lose fidelity where `OracleValueReader` stringifies `TIMESTAMP WITH LOCAL TIME ZONE` with a warning, and (c) replace the correlated UPDATE with MERGE semantics. All three are **regressions**. Keep the server-side copy. The dual `columnTypeMap1`/`columnTypeMap2` binding (source vs target PK precision may differ) also has no PkgroveKit analogue. |
| 0-row `IllegalStateException` / `NotFoundException` guards after write | App-level post-write assertions; PkgroveKit reports `rowsAffected` but doesn't assert an expectation. |

### Why not migrate the single-row `insert()` anyway (the one op whose *semantics* match)

`insert()` is a plain single-row INSERT, so unlike `update()`/the correlated copy its
semantics *do* fit `OracleDialect.insertSql` + `JdbcBatchWriter`. It still isn't worth it:
to call the PkgroveKit writer you must construct a `Schema`/`Column` list, and `Column`
requires a `ValueKind` — a mapping from the Oracle type-name string that the app does **not**
have and PkgroveKit only derives on READ from `ResultSetMetaData`. That means fabricating
placeholder kinds (a latent smell if PkgroveKit ever consults `kind` on the write side) and
~2× the code for a single browser row. Net-negative on both surface and risk.

## Constructive follow-up (PkgroveKit library, not this consumer)

The compare-apply path *would* become PkgroveKit-eligible if the library grew a **native
same-database server-side copy / `INSERT … SELECT` transfer mode** (no client round-trip).
That's a `pkgrovekit-transfer` enhancement adjacent to HEL-170 (cross-DB transaction
coordination) and HEL-161 (bulk fast paths), not an AuditPatchX change. Filed as the audit's
recommendation rather than forced here.

## Acceptance evidence

No source change to the write path (the audit's conclusion is *don't* migrate it), so the
existing PkgroveKit read-path + write-path integration suite is the baseline of record:
`CompareReviewServiceTest` (45) + `DatabaseServiceTest` (28) + `TableResourceTest` (35) +
security/planner tests, all against a live Oracle Testcontainer
(`gvenzl/oracle-free:23-slim-faststart`). Re-run green on this commit.
