# MAXZONEGPT Master Directive Pointer

This document provides the canonical pointer to the MaxZoneGPT master directives that govern the development and operation of the AccountFinanceZone repository.

## Master Directive Location

**Repository:** `OmniQuestMediaInc/MaxZoneGPT`
**Path:** `PROGRAM_CONTROL/DIRECTIVES/QUEUE/COPILOT-DROID-REINDOCTRINATION-MASTER.md`

**Retrieval Command:**

```bash
gh api repos/OmniQuestMediaInc/MaxZoneGPT/contents/PROGRAM_CONTROL/DIRECTIVES/QUEUE/COPILOT-DROID-REINDOCTRINATION-MASTER.md --jq '.content' | base64 -d
```

## Local Reference

The local pointer to this master directive is maintained at:
`PROGRAM_CONTROL/DIRECTIVES/QUEUE/COPILOT-REINDOCTRINATION-LOCAL.md`

## Authority

**Authorized By:** Kevin B. Hartley, CEO — OmniQuest Media Inc.
**Designated Orchestrator:** Claude (Cowork) — Architectural + Coding Authority (as of 2026-05-19)

## Governance Alignment

This repository implements the **Strict Droid Mode** execution pattern defined in the master directives, with the following key alignments:

### 1. Repository Role & Scope

- **Bounded Context:** Finance-only (FIZ scope)
- **Separation of Concerns:** Intentionally separated from AccountsZone (identity/profile)
- **Financial Operations:** Ledger, payments, payouts, subscriptions, fraud detection, compliance

### 2. Governance Requirements

All financial operations in this repository must comply with:

- **Rule Application:** Every financial write requires `rule_applied_id` (documented in `OQMI_GOVERNANCE.md`)
- **Active Governance Rule:** `GOVERNANCE-EQ-v1` (equality verification required)
- **AI Systems Role:** Advisory-only; cannot compute payouts or mutate ledger
- **Compliance Gates:** Mandatory approval before money movement
- **Audit Trail:** Immutable, replayable audit logs for all financial actions
- **Human Review:** Required for changes to `src/ledger/**` and `prisma/**`

### 3. Commit Standards

Commits affecting financial state require dual prefixes:

- **FIZ Prefix:** For finance-zone scope
- **Domain Prefix:** Specific operation (e.g., `ledger`, `payout`, `transaction`)

**Example:** `FIZ: ledger: Implement append-only entry creation with governance validation`

### 4. Infrastructure & Security Policy

Implemented per `OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md`:

- ✅ **Data Residency:** Canadian-only (runtime enforcement)
- ✅ **Encryption:** AES-256-GCM for data at rest, TLS 1.2+ in transit
- ✅ **PCI-DSS Compliance:** Token-only storage, no raw PAN/CVV
- ✅ **Audit Logging:** Immutable AuditTrail model with governance metadata
- ✅ **Ledger Immutability:** Append-only with OFFSET entries for corrections
- ✅ **Cross-Repo Events:** Webhook v1.1 contract with HMAC signing

### 5. Ship-Gate Requirements

All PRs must pass the following gates before merge:

- ✅ **CI Status:** All tests passing
- ✅ **Super-Linter:** Code style and quality checks
- ✅ **Ship-Gate Verifier:** Governance compliance validation
- ✅ **Cleanup Completion:** 8 required cleanup files present
- ✅ **Cyrano Strip:** No direct Cyrano service coupling
- ✅ **Human Review:** Required for ledger and schema changes

**Ship-Gate Verifier:** `PROGRAM_CONTROL/ship-gate-verifier.ts`

### 6. Production Readiness (Phase 4.4)

As of Phase 4.4 completion, this repository implements:

- ✅ **Full Encryption:** Field-level encryption service with KMS integration support
- ✅ **Comprehensive Audit:** AuditService with replay, validation, and governance tracking
- ✅ **Test Coverage:** 45+ tests covering encryption, audit, transactions, ledger, compliance, fraud, webhooks
- ✅ **Failure Scenarios:** Graceful handling of blocked transactions, invalid data, edge cases
- ✅ **PCI Scope Minimization:** Documented in `PCI_SCOPE_MINIMIZATION.md`
- ✅ **Security Hardening:** Production-ready with governance alignment

### 7. Integration Points

**Upstream Systems:**

- AccountsZone (identity/profile data)
- OmniComplianceZone (regulatory controls)

**Downstream Systems:**

- eCommsZone (event delivery via webhook)
- OQMI Analytics Platforms (reporting)

**Event Contract:** v1.1 envelope with standardized headers and HMAC signing

## Operational Guidelines

### Fast Path (Auto-Merge Eligible)

Changes that do NOT touch:

- `src/ledger/**`
- `prisma/**`
- Financial state mutations

### Human Review Required

Changes that touch:

- Ledger service implementation
- Database schema
- Compliance logic
- Governance enforcement
- Audit trail implementation

### AI Agent Restrictions

AI systems (including Copilot, Claude, etc.) operating in this repository:

- ✅ **MAY:** Suggest changes, explain code, draft proposals
- ❌ **MUST NOT:** Directly compute payout amounts
- ❌ **MUST NOT:** Mutate ledger without governance context
- ❌ **MUST NOT:** Bypass compliance checks
- ❌ **MUST NOT:** Mark PR as ready to merge if CI failing (see `.github/COPILOT_INSTRUCTIONS.md`)

## Version History

| Version | Date       | Changes                                              | Authority       |
| ------- | ---------- | ---------------------------------------------------- | --------------- |
| 1.0     | 2026-05-26 | Initial MAXZONEGPT pointer with Phase 4.4 completion | Claude (Cowork) |

## Verification

To verify this repository's alignment with master directives:

```bash
# 1. Check ship-gate status
npm run ship-gate

# 2. Verify governance files
ls -la OQMI_*.md

# 3. Run full test suite
npm test

# 4. Check cleanup completion
npm run ship-gate 2>&1 | grep "Cleanup Progress"
```

## References

- `OQMI_GOVERNANCE.md` — Governance rules and enforcement
- `OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md` — Security and infrastructure requirements
- `.github/COPILOT_INSTRUCTIONS.md` — AI agent operational guidelines
- `PROGRAM_CONTROL/ship-gate-verifier.ts` — Automated compliance verification
- `PCI_SCOPE_MINIMIZATION.md` — PCI-DSS compliance documentation

---

**Status:** ✅ Active
**Compliance:** ✅ Aligned with MaxZoneGPT master directives
**Phase:** 4.4 Complete (Security, Testing & Finalization)
**Production Ready:** ✅ Yes
