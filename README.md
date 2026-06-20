# AccountFinanceZone

AccountFinanceZone is the **finance-only bounded context** for OmniQuest Media Inc. It is intentionally separated from AccountsZone identity/profile concerns.
Repository slug: `AccountFinanceZone`.
Package name: `accounts-finance-zone`.

## Stack

- TypeScript + Node.js + NestJS
- PostgreSQL 16 + Prisma (with pgcrypto extension for encryption)
- Redis 7
- Jest
- Docker
- AWS KMS (encryption at rest)

## Governance and Security Baseline

- Full policy reference: [`OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md`](./OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md)
- Governance reference: [`OQMI_GOVERNANCE.md`](./OQMI_GOVERNANCE.md)
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
- Refunds, chargebacks, and tax/compliance reporting hooks

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
3. Compliance approval is required before money movement.
4. Fraud outcomes can block movement before ledger append.
5. PCI-DSS separation of duties: only vault token IDs are handled here, never raw PAN/CVV.

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

- Required classic branch protection checks: `ci`, `super-linter`, and `ship-gate`
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

- This repo publishes finance lifecycle events: `PaymentProcessed`, `PayoutIssued`, `RefundInitiated`, `ChargebackRegistered`, and `FraudFlagRaised`.
- Compliance checks are designed to call OmniComplianceZone prior to money movement.
