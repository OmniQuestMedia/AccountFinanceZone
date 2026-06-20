# Branch Hygiene — AccountFinanceZone

## Policy

- `main` is the single source of truth. No direct pushes. All changes via PR.
- Branch protection on `main` must require: 1 approving review, CI green, no force-push.
- Feature branches are deleted after merge.
- Branches older than 30 days with no active PR are candidates for deletion.

## Stale Branches Identified (2026-06-20 audit)

Live remote audit. The prior 2026-06-18 list is superseded — 12 of the 15
branches it named have already been deleted from the remote. Remaining
candidates (manual deletion via GitHub UI or `git push origin --delete <branch>`):

| Branch | Last commit | Merged into `main`? | Recommendation |
| --- | --- | --- | --- |
| `claude/jolly-turing-thakuh` | 2026-06-20 | Yes (PR #25) | Safe to delete |
| `copilot/run-hygiene-audit` | 2026-06-04 | Yes | Safe to delete |
| `claude/cleanup-prompts` | 2026-05-26 | No | Stale (~25d) — review then delete |
| `claude/ci-fix-yarn-install-errors` | 2026-05-24 | No | Stale (~27d) — review then delete |
| `claude/restore-full-codebase` | 2026-06-20 | No | Recent — keep for now |
| `ledger-hardening` | 2026-06-19 | No | Superseded by merged ledger-hardening commit on `main`; verify then delete |

## To Enable Branch Protection (Manual Step)

Go to: **GitHub → AccountFinanceZone → Settings → Branches → Add rule**

Set for `main`:

- [x] Require a pull request before merging
- [x] Require approvals: 1
- [x] Require status checks to pass: `financial-invariants` (Financial Invariants Check)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings
- [x] Restrict who can push to matching branches (only admins via emergency protocol)
