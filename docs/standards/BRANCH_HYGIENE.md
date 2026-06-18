# Branch Hygiene — AccountFinanceZone

## Policy

- `main` is the single source of truth. No direct pushes. All changes via PR.
- Branch protection on `main` must require: 1 approving review, CI green, no force-push.
- Feature branches are deleted after merge.
- Branches older than 30 days with no active PR are candidates for deletion.

## Stale Branches Identified (2026-06-18 audit)

The following branches were identified as stale (no active PR, older than 30 days or clearly superseded).
Manual deletion required via GitHub UI or `git push origin --delete <branch>`:

```
agent/cowork-orch-2026-05-19-droid-rollout
claude/add-copilot-instructions-file
claude/add-revenue-share-ledger
claude/ci-fix-yarn-install-errors
claude/cleanup-mission-linter-code-quality
claude/cleanup-prompts
claude/copilot-review-fixes
claude/final-homestretch-cleanup
claude/hygiene-fixes
claude/peaceful-hypatia-jz3Md
claude/phase-4-4-security-testing-finalization
claude/restore-full-codebase
copilot/cleanup-governance-sync
copilot/run-hygiene-audit
feature/playbooks-reference-v1
```

## To Enable Branch Protection (Manual Step)

Go to: **GitHub → AccountFinanceZone → Settings → Branches → Add rule**

Set for `main`:
- [x] Require a pull request before merging
- [x] Require approvals: 1
- [x] Require status checks to pass: `financial-invariants` (Financial Invariants Check)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings
- [x] Restrict who can push to matching branches (only admins via emergency protocol)
