# Rollback rehearsal — 2026-08-04 (HEL-130 acceptance evidence)

The HEL-130 review noted that the stated rollback evidence was "a prior green
revision, not an exercised rollback rehearsal". This document records a REAL,
exercised `git revert` rehearsal on `main`, with the LAN GitLab pipeline
(project `root/auditpatchx`, https://gitlab.local.test — the authoritative CI)
green on both the forward and the revert commit.

## What was rehearsed

A trivial forward change was landed on `main` and then rolled back with
`git revert` (a true inverse commit, not a branch reset), proving the
end-to-end rollback path: revert → push → CI (backend Oracle-testcontainer
suite + frontend suite) → image build → deploy, all green.

| step | commit | content | pipeline | status |
|---|---|---|---|---|
| forward | `850a6afc18e99ea8ba347f762e6c6fdb50bf3a35` | adds a rehearsal marker line to `docs/hel-130-rowrelay-pilot.md` | **1421** | **success** (backend-tests, frontend-tests, build-image, deploy) |
| revert | `92dd2b2d37a20da7fe4563e77e36ccfa38643335` (`git revert 850a6af`) | removes exactly that line — tree byte-identical to pre-forward state for the reverted file | **1423** | **success** (backend-tests 918s, frontend-tests 115s, build-image 574s, deploy 53s) |

Context pipelines from the same evidence run:

- **1420** (`3033fb0d1ff84ed8a2be795120e97804f12b5140`, the HEL-130 lifecycle-test
  commit): success — backend-tests ran the full suite **149 / 0 failures /
  0 errors / 3 skipped** in CI (was 141/0/0/3 baseline; +8 new
  `PkgroveKitLifecycleTest` tests).

Both remotes (GitHub `RobertWell/AuditPatchX` origin + LAN GitLab
`root/auditpatchx`) carry the same commits.

## Image-level rollback procedure (documented only — deployment NOT touched)

AuditPatchX auto-deploys on `main`: `build-image` pushes
`roguerzzz123/auditpatchx:$CI_COMMIT_SHORT_SHA` **and** `:latest`, and the
`deploy` job runs `kubectl rollout restart deployment/auditpatchx -n
auditpatchx` (the Deployment pins `:latest`).

Because every commit also gets an immutable short-SHA tag, an image-level
rollback needs no rebuild:

1. Preferred (exercised here): `git revert <bad-sha>` on `main` → CI rebuilds
   `:latest` from the reverted tree and redeploys. This is exactly what
   pipeline 1423 did (its `deploy` job succeeded).
2. Emergency (bypasses CI): pin the previous good tag directly —
   `kubectl set image deployment/auditpatchx auditpatchx=roguerzzz123/auditpatchx:<good-short-sha> -n auditpatchx`
   — then land the matching revert on `main` so `:latest` catches up.

No deployment objects were modified outside the normal CI `deploy` job during
this rehearsal.
