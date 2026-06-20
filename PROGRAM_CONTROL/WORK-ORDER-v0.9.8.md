# WORK-ORDER-v0.9.8.md — AccountFinanceZone Cleanup

**Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc.  
**Version:** v0.9.8 (2026-05-13) — Cleanup Mode Propagation  
**Status:** CLEANUP MODE — Governance Sync + Cyrano Strip  
**Rule Applied:** GOVERNANCE-EQ-v1 + INFRA_v1.0 §11

## 0. Cleanup Directive

- Cleanup mode is active for this repository.
- New feature work is paused until governance sync, Cyrano strip, and ship-gate hardening are complete.

## 1. Completed This Cycle

- [x] Synced governance and security references in repository docs.
- [x] Added cleanup control artifacts under `PROGRAM_CONTROL/`.
- [x] Added `WEBHOOK_CONTRACTS.md` v1.1 and wired the eCommsZone webhook bridge.
- [x] Added `ci`, `super-linter`, and `ship-gate` workflows for fast-path enforcement.

## 2. Active Lanes

**Lane 1: Governance Sync**

- README, contributing guidance, and policy references are aligned with cleanup mode.

**Lane 2: Cyrano Strip**

- No direct Cyrano references remain in the tracked repository files.
- Cross-repo event forwarding is documented and routed through eCommsZone webhook delivery.

**Lane 3: Ship-Gate Hardening**

- `PROGRAM_CONTROL/ship-gate-verifier.ts` enforces required cleanup files and flags human-review paths.
- Branch protection readiness target: require `ci`, `super-linter`, and `ship-gate`.

## 3. Branch Protection Readiness

- Ready for classic branch protection once required status checks are configured to `ci`, `super-linter`, and `ship-gate`.
- Human review should remain mandatory for `src/ledger/**` and `prisma/**`.

**Handoff Block**  
**Completed this cycle:** Governance docs synced, ship-gate artifacts added, Cyrano references stripped, eCommsZone webhook contract wired.  
**Blockers:** Auto-merge enablement and PR subscriptions still require repository-side GitHub capabilities outside the local repo contents.  
**Next internal steps:** Re-run validation, create the cleanup PR, and apply classic branch protection settings in GitHub.  
**% complete:** Cleanup 85%.
