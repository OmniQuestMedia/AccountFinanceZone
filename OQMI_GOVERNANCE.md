# OQMI Governance (Finance)

Governance requirements implemented in this bounded context:

- `rule_applied_id` is mandatory for all financial writes.
- `GOVERNANCE-EQ-v1` is the active cleanup rule for repository changes and workflow hardening.
- AI systems are advisory-only and cannot compute payouts or mutate ledger state.
- Compliance approval is required before any money movement event.
- Financial audit trails are immutable and replayable.
- Non-financial cleanup pull requests should stay on the fast path once `ci`, `super-linter`, and `ship-gate` are green.
- Human review is reserved for `src/ledger/**` and `prisma/**` changes.
- Cyrano responsibilities are delegated to the dedicated Cyrano repository; this repository must use approved cross-repo contracts only.
