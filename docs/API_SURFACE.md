# API Surface — AccountFinanceZone

> Generated: 2026-05-31
> Rule applied: `GOVERNANCE-EQ-v1`
> All financial writes are append-only. No UPDATE or DELETE paths exist on financial tables.

---

## HTTP Endpoints

### Payouts

| Method | Path                    | Auth        | Description                                                                                                                                         |
| ------ | ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/payouts/preference`   | x-creator-id header (set by API gateway) | Set or update the authenticated creator's payout preference. Sensitive bank/wire fields are AES-256-GCM encrypted (ENCRYPTION_MASTER_KEY) before storage. |
| GET    | `/payouts/preference`   | x-creator-id header (set by API gateway) | Retrieve the authenticated creator's current payout preference. Sensitive fields are decrypted on read.                                             |
| POST   | `/payouts/request`      | x-creator-id header (set by API gateway) | Submit a payout request. Validates minimum threshold ($50) and no active holds. Creates append-only `PayoutRequest` record. |
| GET    | `/payouts/requests`     | x-creator-id header (set by API gateway) | List all payout requests for the authenticated creator.                                                                                             |
| GET    | `/payouts/requests/:id` | x-creator-id header (set by API gateway) | Get status of a single payout request.                                                                                                              |

### Theatre / Linger

| Method | Path                                | Auth            | Description                                                                                           |
| ------ | ----------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| POST   | `/theatre/shows`                    | x-creator-id header (set by API gateway) | Create a new theatre show block.                                                                      |
| POST   | `/theatre/shows/:id/linger`         | System/Internal | Record a viewer linger event (viewer-seconds in show block). Append-only.                             |
| POST   | `/theatre/shows/:id/settle`         | Admin/System (internal)    | Settle the show block: calculate per-creator payouts and append ledger entries. Marks show `SETTLED`. |
| GET    | `/theatre/shows/:id/payout-preview` | Creator/Admin   | Preview payout distribution before settlement. Read-only.                                             |

---

## NATS / Webhook Events

### Published by AccountFinanceZone

All events are delivered to eCommsZone via the v1.1 webhook contract (`ECOMMSZONE_WEBHOOK_URL`).

| Event Type              | Trigger                        | Key Payload Fields                                                    |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `PaymentProcessed`      | Successful payment             | `accountId`, `amountMinor`, `currency`, `sourceEventId`               |
| `RefundInitiated`       | Refund appended to ledger      | `offsetOfEntryId`                                                     |
| `ChargebackRegistered`  | Chargeback appended            | `offsetOfEntryId`                                                     |
| `FraudFlagRaised`       | Fraud risk detected            | `fraud.riskScore`, `fraud.flags`, `fraud.decision`, `source`          |
| `PayoutIssued`          | Payout ledger entry appended   | `creatorAccountId`, `amountMinor`, `revenueShareBps`, `ledgerEntryId` |
| `PayoutSettled`         | Payout settlement confirmed    | `creatorAccountId`, `amountMinor`, `settledAt`                        |
| `PayoutFailed`          | Payout processing failed       | `creatorAccountId`, `reason`                                          |
| `payout.requested`      | Creator submits payout request | `payoutRequestId`, `creatorId`, `amountCents`, `method`               |
| `payout.settled`        | Payout request settled         | `payoutRequestId`, `settlementId`, `method`, `settledAt`              |
| `theatre.block.settled` | Theatre show block settled     | `showId`, `payouts` (Map creatorId->amountCents)                      |

### Consumed by AccountFinanceZone

| Event Type                    | Source Zone  | Handler                                          | Description                                             |
| ----------------------------- | ------------ | ------------------------------------------------ | ------------------------------------------------------- |
| `SubscriptionPlanChangeEvent` | AccountsZone | `BillingService.consumeSubscriptionTierChange()` | Updates revenue share basis points on tier change       |
| `AccountLinkingEvent`         | AccountsZone | `BillingService.linkAccountToCreator()`          | Links fan account to creator for revenue share tracking |

---

## Environment Variables

| Variable                    | Required             | Description                                                    |
| --------------------------- | -------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`              | Yes                  | PostgreSQL connection string                                   |
| `REDIS_URL`                 | Yes                  | Redis connection string                                        |
| `DATA_RESIDENCY_REGION`     | Yes                  | Must be `ca-central-1` (enforced)                              |
| `COMPLIANCE_ZONE_URL`       | Yes                  | OmniComplianceZone base URL                                    |
| `AWS_REGION`                | Yes                  | Must be `ca-central-1`                                         |
| `AWS_KMS_KEY_ID`            | Yes                  | ARN of the KMS key for encryption at rest                      |
| `AWS_KMS_KEY_ALIAS`         | Yes                  | KMS key alias (e.g. `alias/accountfinancezone-encryption-key`) |
| `AWS_ACCESS_KEY_ID`         | No                   | Use IAM roles in production                                    |
| `AWS_SECRET_ACCESS_KEY`     | No                   | Use IAM roles in production                                    |
| `DB_ENCRYPTION_ENABLED`     | Yes                  | Enable pgcrypto column-level encryption                        |
| `ECOMMSZONE_WEBHOOK_URL`    | Yes                  | eCommsZone webhook delivery endpoint                           |
| `ECOMMSZONE_WEBHOOK_SECRET` | No                   | HMAC-SHA256 signing secret for webhook delivery                |
| `NOWPAYMENTS_API_KEY`       | Yes (crypto payouts) | NOWPayments API key for CRYPTO_NOWPAYMENTS settlements         |
| `ENCRYPTION_MASTER_KEY`     | Yes                  | 32-byte hex key for AES-256-GCM encryption of sensitive payout preference fields |
| `NODE_ENV`                  | Yes                  | `development` or `production`                                  |
| `PORT`                      | No                   | HTTP listen port (default: 3000)                               |

---

## Ledger Tables (Append-Only)

| Table                        | Prisma Model              | Append-Only | Notes                                                                     |
| ---------------------------- | ------------------------- | ----------- | ------------------------------------------------------------------------- |
| `ledger_entries`             | `LedgerEntry`             | **Yes**     | CREDIT / DEBIT / OFFSET entry types. Corrections use OFFSET entries only. |
| `transactions`               | `Transaction`             | **Yes**     | Every payment, refund, chargeback, payout flow.                           |
| `payouts`                    | `Payout`                  | **Yes**     | Creator payout records with revenue share basis points.                   |
| `payout_requests`            | `PayoutRequest`           | **Yes**     | Creator-submitted requests; status transitions only go forward.           |
| `payout_settlements`         | `PayoutSettlement`        | **Yes**     | Settlement records written after processing.                              |
| `theatre_shows`              | `TheatreShow`             | **Yes**     | Show block metadata. `block_end_at` and `status` written once on settle.  |
| `theatre_tickets`            | `TheatreTicket`           | **Yes**     | One record per fan ticket purchase.                                       |
| `linger_events`              | `LingerEvent`             | **Yes**     | Viewer-seconds records per guest per show block.                          |
| `fraud_assessments`          | `FraudAssessment`         | **Yes**     | Risk scores and decisions.                                                |
| `audit_trail`                | `AuditTrail`              | **Yes**     | Immutable event log for all financial aggregates.                         |
| `payment_method_tokens`      | `PaymentMethodToken`      | **Yes**     | Vault token references only - no raw PAN/CVV.                             |
| `creator_payout_preferences` | `CreatorPayoutPreference` | No          | Mutable preference record per creator (one row, updated).                 |

> **Invariant:** All tables in the "Append-Only: Yes" column must never have `UPDATE` or `DELETE` statements executed against financial data rows. Status and lifecycle fields (`status`, `block_end_at`) may advance forward-only via monotonic state transitions (e.g. PENDING → PROCESSING → SETTLED). Financial corrections are modeled as new OFFSET/reversal rows referencing the original entry — never as updates to existing rows.

---

## Financial Invariants

1. Every financial write carries `rule_applied_id` and `auditTraceId` / `correlation_id`.
2. Ledger is append-only; corrections are represented as OFFSET entries.
3. Compliance approval (OmniComplianceZone) is required before any money movement.
4. Fraud outcomes can block movement before ledger append.
5. PCI-DSS: only vault token IDs are handled here - never raw PAN/CVV.
6. AI is advisory-only; AI must never autonomously mutate the ledger.
7. Data residency: all writes must target `ca-central-1`.
