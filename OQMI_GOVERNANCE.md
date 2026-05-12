# OQMI Governance (Finance)

Governance requirements implemented in this bounded context:

- `rule_applied_id` is mandatory for all financial writes.
- AI systems are advisory-only and cannot compute payouts or mutate ledger state.
- Compliance approval is required before any money movement event.
- Financial audit trails are immutable and replayable.
