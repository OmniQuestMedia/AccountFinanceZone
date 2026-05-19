# COPILOT-REINDOCTRINATION-LOCAL — AccountFinanceZone

**Document ID:** COPILOT-REINDOCTRINATION-LOCAL
**Type:** Local standing prompt — pointer to canonical master
**Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc.
**Orchestrator:** Claude (Cowork) — Architectural + Coding Authority per 2026-05-19
**Repo:** `OmniQuestMediaInc/AccountFinanceZone`
**Path:** `PROGRAM_CONTROL/DIRECTIVES/QUEUE/COPILOT-REINDOCTRINATION-LOCAL.md`
**Effective:** 2026-05-19
**Master:** `OmniQuestMediaInc/MaxZoneGPT/PROGRAM_CONTROL/DIRECTIVES/QUEUE/COPILOT-DROID-REINDOCTRINATION-MASTER.md`

-----

## YOU ARE COPILOT IN STRICT DROID MODE

For the complete, canonical Strict Droid Mode contract — read order, execution loop, hard-stop conditions, report-back format — fetch and read the master file above. That is the binding source of truth.

```
gh api repos/OmniQuestMediaInc/MaxZoneGPT/contents/PROGRAM_CONTROL/DIRECTIVES/QUEUE/COPILOT-DROID-REINDOCTRINATION-MASTER.md --jq '.content' | base64 -d
```

This local file adds repo-specific context only.

## REPO ROLE & STATUS

**Role:** Finance-only bounded context (FIZ scope); explicitly separated from AccountsZone identity concerns
**Status:** Active — but missing .github/copilot-instructions.md (follow-on directive pending)

## PRIORITY DIRECTIVES IN THIS REPO'S QUEUE

No directives queued via Cowork orchestrator yet. Follow-on: GOV-ACCOUNTFINANCEZONE-DROID-CONTRACT-001 to add local droid contract (FIZ-aware variant).

## REPO-SPECIFIC NOTES

FIZ scope — all commits touching balance/ledger/payout/escrow require dual prefix (FIZ: + relevant) with REASON, IMPACT, CORRELATION_ID. Append-only finance — no UPDATE on balance columns. NestJS.

## START

1. Workspace probe (`pwd`, `git status`, `git remote -v`)
2. Fetch and read the canonical master (command above)
3. Read this repo's `.github/copilot-instructions.md` (if present)
4. Read this file (you are here)
5. `ls PROGRAM_CONTROL/DIRECTIVES/QUEUE/`
6. Pick the highest-priority directive matching this repo's scope
7. Begin the master's execution loop

## ROUTING

- `Agent: copilot` → execute
- `Agent: grok` (queued before 2026-05-19) → re-routed to copilot per GOV-CANONICAL-AGENT-CHANGE-001 §3
- `CEO_GATE: YES` → draft + flag, do not auto-merge
- Cross-repo coordination → file `CROSS-REPO-FLAG-*` in both affected repos
