# AccountsFinanceZone

AccountsFinanceZone is the **finance-only bounded context** for OmniQuest Media Inc. It is intentionally separated from AccountsZone identity/profile concerns.
Repository slug: `AccountsFinanceZone`.
Package name: `accounts-finance-zone`.

## Stack
- TypeScript + Node.js + NestJS
- PostgreSQL + Prisma
- Redis
- Jest
- Docker

## Governance and Security Baseline
- Full policy reference: [`OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md`](./OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md)
- Governance reference: [`OQMI_GOVERNANCE.md`](./OQMI_GOVERNANCE.md)
- Append-only financial ledger (offset entries only; no destructive ledger mutation paths)
- `rule_applied_id` required on every financial write
- AI advisory-only; AI cannot compute payouts or mutate the ledger
- Immutable audit trail model and compliance-first control points
- Canadian data residency only

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
      AccountsFinanceZone
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
npm install
npm run lint
npm test
npm run build
```

## Docker
```bash
docker compose up --build
```

## Notes
- This repo publishes finance lifecycle events: `PaymentProcessed`, `PayoutIssued`, `RefundInitiated`, `ChargebackRegistered`, and `FraudFlagRaised`.
- Compliance checks are designed to call OmniComplianceZone prior to money movement.
