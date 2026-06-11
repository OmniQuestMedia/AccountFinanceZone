# Contributing to AccountFinanceZone

## Cleanup Mode
- Cleanup mode is the active operating posture for this repository
- Apply `GOVERNANCE-EQ-v1` on every change
- Pause new feature work and new work orders until cleanup mode is cleared

## Required References
- [`OQMI_GOVERNANCE.md`](./OQMI_GOVERNANCE.md)
- [`OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md`](./OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md)
- [`PROGRAM_CONTROL/WORK-ORDER-v0.9.8.md`](./PROGRAM_CONTROL/WORK-ORDER-v0.9.8.md)
- [`WEBHOOK_CONTRACTS.md`](./WEBHOOK_CONTRACTS.md)

## Change Boundaries
- Do not add direct Cyrano calls or contracts in this repository
- Route cross-repo event delivery through the eCommsZone webhook bridge
- Keep ledger writes append-only and preserve `rule_applied_id` on every financial mutation

## Pull Requests
- Use small, reviewable pull requests
- Keep `ci`, `super-linter`, and `ship-gate` green before requesting merge
- Expect human review for changes under `src/ledger/**` and `prisma/**`
- Non-financial cleanup PRs may use the fast path when ship-gate reports no human review requirement

## Local Validation
```bash
npm install
npm run lint
npm test
npm run build
npm run ship-gate
```
