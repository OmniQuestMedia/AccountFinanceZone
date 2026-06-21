# AccountFinanceZone

AccountFinanceZone is the **finance-only bounded context** for OmniQuest Media Inc.
It is intentionally separated from AccountsZone identity/profile concerns.
Repository slug: `AccountFinanceZone`.
Package name: `accounts-finance-zone`.

---

## ⚠️ MIGRATION READINESS STATUS (2026-06-18)

**FullHost server migration window: 24-72h.**
Track progress: [`docs/standards/MIGRATION_CHECKLIST.md`](./docs/standards/MIGRATION_CHECKLIST.md)

### Canonical Corpus v11 Invariants (must hold post-migration)

1. **Append-only ledger** — no UPDATE/DELETE on `ledger_entries`. Corrections are offset entries only.
2. **Three-bucket wallet** — spend order enforced: `promotional` → `rewards` → `cash`. No out-of-order debit.
3. **DFSP stack** — AccountFinanceZone is the sole ledger writer. GateGuard pre-authorizes all debits.
4. **No cash refunds** — VIP Refund Protocol issues promotional credits only. No reversal primitives.
5. **Chargeback assembler** — bank-initiated chargebacks packaged with immutable ledger snapshot.
6. **FINTRAC/AML** — thresholds, structuring detection, PEP/OFAC screening active.
7. **Idempotency** — double-spend prevention via idempotency key on all debit paths.

Full invariant spec: [`docs/standards/CANONICAL_CORPUS_v11_INVARIANTS.md`](./docs/standards/CANONICAL_CORPUS_v11_INVARIANTS.md)

### Manual Actions Required Before Cutover

- [ ] Enable branch protection on `main` (GitHub UI → Settings → Branches → Add rule)
- [ ] Delete 15 stale branches (see [`docs/standards/BRANCH_HYGIENE.md`](./docs/standards/BRANCH_HYGIENE.md))
- [ ] Audit `services/stripe/` for deprecated API versions or hardcoded keys
- [ ] Verify escrow hold matrix and chargeback assembler in `src/fraud/` / `src/compliance/`

---

## Stack

- TypeScript + Node.js + NestJS
- PostgreSQL 16 + Prisma (with pgcrypto extension for encryption)
- Redis 7
- Jest
- Docker
- AWS KMS (encryption at rest)

## Integrating with AccountFinanceZone

If you are building a consumer service (Rewards, Marketplace, OKIB,
OmniComplianceZone, etc.), start here:

- **[`docs/INTEGRATION_GUIDE.md`](./docs/INTEGRATION_GUIDE.md)** — consumer
  onboarding: event envelope, idempotency, headers, examples per zone.
- [`docs/ERROR_CONTRACT.md`](./docs/ERROR_CONTRACT.md) — stable, machine-readable
  error codes and retry semantics.
- [`docs/API_SURFACE.md`](./docs/API_SURFACE.md) — HTTP endpoints and events.
- [`docs/INTEGRATION_CONTRACT.md`](./docs/INTEGRATION_CONTRACT.md) — request/response bodies.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — integration architecture and readiness scorecard.

Key integration guarantees: every published event carries a stable `eventId`
(dedupe key, also the `x-oqmi-event-id` header) and an `eventVersion`; outbound
delivery is at-least-once; inbound events are validated; errors follow a typed
contract. Consumer-simulation tests live in [`test/integration/`](./test/integration/).

## Governance and Security Baseline

- Full policy reference: [`OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md`](./OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md)
- Governance reference: [`OQMI_GOVERNANCE.md`](./OQMI_GOVERNANCE.md)
- Standards: [`docs/standards/`](./docs/standards/)
- Financial flow patterns: [`docs/architecture/financial-flows.md`](./docs/architecture/financial-flows.md)
- Payments/payouts reliability & compliance review: [`docs/payments-and-payouts-review.md`](./docs/payments-and-payouts-review.md)
- Cleanup control lane: [`PROGRAM_CONTROL/WORK-ORDER-v0.9.8.md`](./PROGRAM_CONTROL/WORK-ORDER-v0.9.8.md)
- Ship gate verifier: [`PROGRAM_CONTROL/ship-gate-verifier.ts`](./PROGRAM_CONTROL/ship-gate-verifier.ts)
- Webhook contract: [`WEBHOOK_CONTRACTS.md`](./WEBHOOK_CONTRACTS.md)
- Append-only financial ledger (offset entries only; no destructive ledger mutation paths)
- `rule_applied_id` required on every financial write
- AI advisory-only; AI cannot compute payouts or mutate the ledger
- Immutable audit trail model and compliance-first control points
- Canadian data residency only
- Cleanup mode rule applied on every change: `GOVERNANCE-EQ-v1`

## Domain Scope

- Purchases, subscriptions, one-time payments
- Creator payouts and revenue sharing
- Payment method token references (no raw card data)
- Transaction history and append-only ledger references
- Fraud scoring and risk flags
- Chargebacks and tax/compliance reporting hooks
- **No cash refunds** (Canonical Corpus v11 — VIP Refund Protocol only)

## High-Level Integration Diagram

```text
AccountsZone events (tier change, entitlement)
              |
              v
      AccountFinanceZone
  (transactions, billing, payouts,
   ledger, fraud, compliance)
        |               \
        v                v
OmniComplianceZone   Downstream OQMI platforms
(policy checks,      (reporting, analytics,
regulatory controls) settlement, auditing)
```

## Financial Invariants

1. Every financial write must carry `rule_applied_id` and `auditTraceId`.
2. Ledger is append-only; corrections are represented as offset entries.
3. Three-bucket wallet spend order: `promotional` → `rewards` → `cash`.
4. Compliance approval is required before money movement.
5. Fraud outcomes can block movement before ledger append.
6. PCI-DSS separation of duties: only vault token IDs are handled here, never raw PAN/CVV.
7. No cash refunds — re-issue as promotional credits only.

## Folder Structure

```text
src/
├── transactions/
├── billing/
├── payouts/
├── ledger/
├── fraud/
├── compliance/
├── events/
└── prisma/

docs/
├── architecture/
│   └── financial-flows.md          # target-state money-movement patterns
├── standards/
│   ├── CANONICAL_CORPUS_v11_INVARIANTS.md
│   ├── MIGRATION_CHECKLIST.md
│   └── BRANCH_HYGIENE.md
├── API_SURFACE.md
├── INTEGRATION_CONTRACT.md
├── payments-and-payouts-review.md  # reliability & compliance review
└── PLAYBOOKS-REFERENCE.md
```

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment (copy and configure)
cp .env.example .env

# Run linting and tests
npm run lint
npm test
npm run build
npm run ship-gate

# Start with Docker (includes PostgreSQL with encryption enabled)
docker compose up --build
```

## Environment Configuration

Key environment variables (see `.env.example` for full list):

- `DATABASE_URL` - PostgreSQL connection string
- `AWS_REGION` - Must be `ca-central-1` for Canadian data residency
- `AWS_KMS_KEY_ID` - ARN of dedicated KMS key for encryption
- `AWS_KMS_KEY_ALIAS` - Key alias (e.g., `alias/accountfinancezone-encryption-key`)
- `DB_ENCRYPTION_ENABLED` - Enable database encryption (required in production)
- `DATA_RESIDENCY_REGION` - Data residency region (enforced: `ca-central-1`)

## Fast Path and Ship-Gate

- Required classic branch protection checks: `ci`, `super-linter`, `ship-gate`, and `financial-invariants`
- Non-financial cleanup PRs stay on the fast path when ship-gate reports no human review requirement
- Human review is reserved for `src/ledger/**` and `prisma/**`
- Direct Cyrano integration is not allowed in this repository; cross-repo delivery must use the v1.1 webhook contract

## eCommsZone Delivery

- Finance events are published locally and can be forwarded to eCommsZone with `ECOMMSZONE_WEBHOOK_URL`
- Optional HMAC signing is enabled with `ECOMMSZONE_WEBHOOK_SECRET`
- Contract details are documented in [`WEBHOOK_CONTRACTS.md`](./WEBHOOK_CONTRACTS.md)

## Docker

```bash
docker compose up --build
```

## Notes

- This repo publishes finance lifecycle events: `PaymentProcessed`, `PayoutIssued`, `ChargebackRegistered`, and `FraudFlagRaised`.
- `RefundInitiated` event is deprecated — no cash refunds permitted (Canonical Corpus v11).
- Compliance checks are designed to call OmniComplianceZone prior to money movement.
