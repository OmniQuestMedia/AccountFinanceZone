# Payments, Escrow & Payouts — Reliability and Compliance Review

> Review date: 2026-06-20
> Reviewer: Engineering (OmniQuest Media Inc.)
> Bounded context: `AccountFinanceZone`
> Rule applied: `GOVERNANCE-EQ-v1`
> Scope: payment processing, escrow/hold management, creator payouts, and the
> integration points with external processors and internal OQMI zones.

---

## 0. How to read this document

This is a **review and hardening plan**, not a code change. It records the
current state of the money-movement paths, the risks found, and a prioritized
set of recommendations. Every finding is backed by a `file:line` reference so
it can be verified independently. Code changes that touch `src/ledger/**` or
`prisma/**` require human review per `OQMI_GOVERNANCE.md` and are tracked as
follow-up work items (see §7), not applied here.

Severity legend: **P0** = blocks production money movement / breaks a stated
invariant · **P1** = correctness or compliance risk under load/failure ·
**P2** = hardening / hygiene.

---

## 1. Executive summary

AccountFinanceZone has a well-documented governance model (Canonical Corpus
v11), a clean module layout, a real AES-256-GCM encryption service, a
DB-backed audit service, and a thoughtfully designed Postgres schema for
ledger, payouts, theatre, and audit. The **documentation describes a durable,
append-only, fully-audited financial system.**

The **runtime does not yet match that documentation.** The core ledger,
payout reconciliation, idempotency guard, and account-link maps are all held
in **process-local memory**, the **audit service is never invoked**, and the
**Postgres financial tables are largely unwritten**. There are **no database
transactions** wrapping multi-step money movements, and **escrow/holds and
checkout-confirmation are specified but unimplemented**.

**Readiness verdict: NOT READY for production money movement.** The system is
suitable for contract/shape validation and tests, but the durability,
atomicity, and auditability guarantees that compliance depends on are not
enforced at runtime. The gap is closable — the schema and audit primitives
already exist; they need to be wired into the flows. See §6 for the readiness
matrix and §7 for the sequenced plan.

---

## 2. Scope and method

Reviewed the full money-movement surface:

- `src/transactions/` — payment, VIP credit, chargeback registration
- `src/payouts/` — revenue-share payouts, payout requests, settlements, prefs
- `src/theatre/` — theatre/linger block payout engine
- `src/ledger/` — append-only ledger primitive
- `src/wallet/` — three-bucket wallet allocation
- `src/compliance/`, `src/fraud/` — pre-movement guards, AML, chargebacks
- `src/events/`, `services/stripe/` — external/internal integration points
- `src/common/` — audit, encryption, shared types
- `prisma/schema.prisma` — persistence model
- Governance/contract docs under `docs/`, plus root `*.md` policy files

Method: static read of every service in the money path, cross-referencing
runtime behavior against the documented invariants in
`docs/standards/CANONICAL_CORPUS_v11_INVARIANTS.md`, `docs/API_SURFACE.md`,
and `docs/INTEGRATION_CONTRACT.md`.

---

## 3. Current-state audit

### 3.1 Payment processing

`TransactionService.processPayment` (`src/transactions/transaction.service.ts:29`):

1. Idempotency check against an **in-memory `Set`** (`:19`).
2. `ComplianceGuard.assertMoneyMovementAllowed` (`:40`).
3. `FraudService.assess`; `BLOCK` raises a fraud event and throws (`:48-64`).
4. `LedgerService.appendEntry` DEBIT (`:68`).
5. Publish `PaymentProcessed` (`:77`).

Observations:

- The DEBIT is written **only to memory** (`src/ledger/ledger.service.ts:44`),
  not to `ledger_entries`. There is no balance check, no wallet bucket
  allocation (`WalletService.computeDebitAllocation` exists but is **not
  called** here), and no `Transaction` row is persisted.
- The `MoneyMovementRequest.paymentTokenId` is accepted but never validated
  against `PaymentMethodToken` and never persisted.
- Universal Checkout Confirmation (Canonical Corpus v11 §8) — `transactionId`,
  `userId`, `bucketBreakdown`, `gateguardAuthToken` — is typed in
  `src/common/types.ts:8` (`CheckoutConfirmation`) but **no confirmation gate
  is implemented**; debits do not require a validated confirmation.

### 3.2 Refunds and chargebacks

- Cash refunds are correctly **prohibited**: `initiateRefund` throws
  (`src/transactions/transaction.service.ts:93`); the VIP path re-issues
  promotional credit (`:99`). This matches Invariant §4. ✅
- `registerChargeback` appends an `OFFSET` entry referencing the original
  (`:129`) — correct append-only correction model. ✅ (But the offset is
  in-memory, see §5.)
- `ChargebackService` (`src/compliance/chargeback.service.ts`) is a clean
  state machine with valid transition guards, but stores packages in an
  **in-memory `Map`** (`:43`) and is **not wired** to any controller, webhook,
  or the Stripe integration. Canonical Corpus v11 §6 expects chargebacks to
  arrive via processor webhook — that ingress does not exist.

### 3.3 Escrow / hold management

- Canonical Corpus v11 §5 specifies an Escrow & Hold Matrix
  (`pending_hold`, `dispute_hold`, `payout_reserve`) with explicit,
  audit-logged unlock events.
- **No implementation exists**: no Prisma models for holds, no escrow service,
  no lock/unlock API. Chargeback funds are documented as "held from merchant
  payout" but nothing reserves or freezes balance.
- The three-bucket wallet (`src/wallet/wallet.service.ts`) models spendable
  balance but has **no locked/escrow bucket** and is itself **never persisted
  or invoked** by the payment path.

### 3.4 Payout flows (two parallel systems)

**System A — revenue-share payouts (in-memory).**
`PayoutService` (`src/payouts/payout.service.ts`): `calculateRevenueShare`
uses correct BigInt math with remainder-to-platform (`:57-79`) ✅;
`issuePayout` runs a compliance check, appends an in-memory ledger CREDIT, and
pushes an **in-memory** `reconciliationRecords` entry (`:85-132`).
`settlePayout`/`failPayout` mutate those in-memory records (`:138-194`).

**System B — payout requests (DB-backed).**
`PayoutRequestService.submit` (`src/payouts/payout-request.service.ts:34`):
validates min $50, validates method, checks for an active hold, inserts a
`PayoutRequest`. `PayoutSettlementService.processPayoutRequest`
(`src/payouts/payout-settlement.service.ts:22`): atomically advances
`PENDING → PROCESSING` via `updateMany` (good optimistic guard, `:24`), then
either stubs NOWPayments or queues a manual settlement.

**The two systems do not reference or reconcile with each other.** A
revenue-share payout (A) produces no `PayoutRequest`/`PayoutSettlement` row,
and a payout request (B) produces no ledger entry. There is no single source
of truth for "what does the platform owe this creator."

### 3.5 Theatre / linger payout engine

`TheatrePayoutService.settleBlockPayout`
(`src/theatre/theatre-payout.service.ts:126`):

- Atomically claims the block `ACTIVE → SETTLING` via `updateMany` (`:128`) —
  good concurrency guard. ✅
- Computes per-creator shares with floor math (`calculateBlockPayout`,
  `:82-124`) — deterministic and well-tested.
- Appends **in-memory** ledger CREDITs, then updates the show to `SETTLED`
  (`:168-185`). The ledger append and the status update are **not in one DB
  transaction**, and the ledger append is not durable.
- On error, sets status `FAILED` (`:201`) but issues **no compensating
  reversal** for any credits already appended before the failure.

### 3.6 Persistence & audit reality check

- `LedgerService` is in-memory (`src/ledger/ledger.service.ts:24`). **P0.**
- `AuditService` (`src/common/audit.service.ts`) is comprehensive and tested
  but **imported by nothing** — no `AuditModule`, no caller. The immutable
  audit trail invariant is **not enforced at runtime**. **P0.**
- No code writes `Transaction`, `Payout`, `FraudAssessment`, or
  `PaymentMethodToken` rows; `LedgerEntry` is never written via Prisma. The
  documented append-only tables are **unused at runtime**. **P0.**

### 3.7 What is solid today (keep)

- BigInt minor-unit arithmetic throughout — no float money. ✅
- Revenue-share remainder-to-platform avoids rounding leakage
  (`payout.service.ts:71`). ✅
- AES-256-GCM authenticated encryption with auth-tag verification for payout
  preferences (`src/common/encryption.service.ts`); sensitive fields cleared
  on update (`creator-payout-preference.service.ts:73-85`). ✅
- Optimistic state-claim guards in theatre and payout settlement. ✅
- No-cash-refund enforcement and append-only OFFSET correction model. ✅
- HMAC-signed, timeout-bounded, non-blocking webhook delivery
  (`ecomms-zone.client.ts`). ✅ (delivery durability addressed in §5).

---

## 4. Integration points review

| Counterparty                         | Direction           | Mechanism                                                             | Status / Risk                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **eCommsZone** (receipt bus)         | outbound            | HTTPS webhook v1.1, HMAC-SHA256, 3s timeout (`ecomms-zone.client.ts`) | Fire-and-forget, **no outbox/retry** → events lost on crash. **P1**                                                                                                                                                                                  |
| **OmniComplianceZone**               | outbound (intended) | `ComplianceService.evaluate` (`compliance.service.ts:18`)             | **Stub** — only checks `residencyRegion === 'CA'`; the documented OmniComplianceZone call is a comment. Money movement is gated on a constant. **P1**                                                                                                |
| **Stripe** (processor)               | inbound/outbound    | `services/stripe/StripeService.ts`                                    | **Simulation only** — `createTwinSubscription` returns a fake object; "TODO: Real Stripe call + webhook later". **No webhook ingress**, so chargebacks (Corpus §6) cannot arrive. Uses USD, outside the CAD/`ca-central-1` residency posture. **P1** |
| **NOWPayments** (crypto payout rail) | outbound            | `payout-settlement.service.ts:57`                                     | **Stub** — marks settlement `SETTLED` with a locally-generated `external_ref` before any real call; when wired, will mark money sent without processor confirmation. **P1**                                                                          |
| **AccountsZone** (Rewards/identity)  | inbound             | `BillingService.consume*` (`billing.service.ts:44,70`)                | Handlers only `console.log` and write to an **in-memory `Map`** (`:36`); no persistence, no event bus subscription wiring. **P2**                                                                                                                    |
| **Rewards / Marketplace / ChatNow**  | n/a                 | —                                                                     | No direct integration code present. Revenue-share **policy** (tier → BPS) is hardcoded in finance (`billing.service.ts:27`) rather than sourced from the owning domain — see §4.1.                                                                   |
| **GateGuard** (pre-auth)             | inbound (intended)  | —                                                                     | Referenced by Corpus §3/§8 (`gateguardAuthToken`) but **no integration**; debits are not pre-authorized. **P1**                                                                                                                                      |

### 4.1 Internal wiring defect

`BillingModule` (`src/billing/billing.module.ts`) does **not** import
`PayoutsModule`, and `BillingService`'s constructor declares
`payoutService?: PayoutService` as optional (`billing.service.ts:38`). In the
real Nest DI container the dependency resolves to `undefined`, so
`calculateAndIssuePayoutForTransaction` throws _"PayoutService not available"_
(`:103`). The billing → payout bridge **only works in unit tests** that pass a
mock. **P1.**

---

## 5. Risk register

### 5.1 Concurrency

| ID  | Risk                                                                                                                                                                                                                                             | Evidence                                  | Sev    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------ |
| C-1 | **Idempotency not durable/shared.** In-memory `Set` resets on restart and is per-instance, so the same `idempotencyKey` can be replayed across instances or after a deploy → **double debit**. Contradicts Corpus §8 ("checked against ledger"). | `transaction.service.ts:19,31`            | **P0** |
| C-2 | **Check-then-insert race on active payout hold.** Two concurrent `submit` calls both pass the `findFirst` active-hold check before either inserts → duplicate in-flight payout requests. No DB unique/partial-index guard.                       | `payout-request.service.ts:49-64`         | **P1** |
| C-3 | **Non-atomic settlement.** `payoutSettlement.create` then a separate `payoutRequest.update` — a crash between them leaves the request stuck in `PROCESSING` with an orphan settlement.                                                           | `payout-settlement.service.ts:75-89`      | **P1** |
| C-4 | **Non-atomic theatre settle.** In-memory ledger appends + `SETTLED` update are not one transaction; partial failure yields inconsistent state and no reversal.                                                                                   | `theatre-payout.service.ts:168-205`       | **P1** |
| C-5 | Optimistic `updateMany` guards (good) are undermined because the _subsequent_ work is not transactional with the claim.                                                                                                                          | `:128`, `payout-settlement.service.ts:24` | P2     |

### 5.2 Failure handling

| ID  | Risk                                                                                                                                                                                        | Evidence                                                                | Sev    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ |
| F-1 | **Event loss.** Publish is fire-and-forget with no outbox; a crash after a financial write but before delivery silently drops the eCommsZone receipt → downstream divergence. No retry/DLQ. | `event.publisher.ts:15`, `ecomms-zone.client.ts:64`                     | **P1** |
| F-2 | **Settlement marks success without confirmation.** NOWPayments stub sets `SETTLED` + synthetic `external_ref` with no processor ack; real wiring must not inherit this.                     | `payout-settlement.service.ts:75-89`                                    | **P1** |
| F-3 | **No compensation on partial theatre payout.** Failure after some credits → `FAILED` status but credits remain.                                                                             | `theatre-payout.service.ts:199-206`                                     | **P1** |
| F-4 | **Compliance is a constant, not a call.** A real OmniComplianceZone outage/decision is not represented; movement proceeds on region check alone.                                            | `compliance.service.ts:18-25`                                           | P1     |
| F-5 | No global volatility recovery: process restart erases ledger, idempotency, reconciliation records, account links.                                                                           | `ledger.service.ts:24`, `payout.service.ts:41`, `billing.service.ts:36` | **P0** |

### 5.3 Auditability

| ID  | Risk                                                                                                                                                                                             | Evidence                                         | Sev    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------ |
| A-1 | **Append-only ledger is in-memory**, not the `ledger_entries` table the contracts promise. No durable, queryable, immutable ledger exists.                                                       | `ledger.service.ts:24` vs `API_SURFACE.md:87`    | **P0** |
| A-2 | **AuditService never called.** Immutable/replayable audit trail (OQMI governance) is unenforced; no flow writes `audit_trail`.                                                                   | grep: only `audit.service.spec.ts` references it | **P0** |
| A-3 | **Schema/runtime divergence.** `Transaction`, `Payout`, `FraudAssessment`, `PaymentMethodToken`, `LedgerEntry` tables are never written; auditors querying Postgres see empty financial history. | no `prisma.<model>.create` for these             | **P0** |
| A-4 | **Two unreconciled payout ledgers** prevent a single authoritative creator-owed balance.                                                                                                         | §3.4                                             | P1     |
| A-5 | Escrow lock/unlock audit trail (Corpus §5) cannot be populated because escrow doesn't exist.                                                                                                     | §3.3                                             | P1     |

---

## 6. Separation of concerns — payments vs. rewards/points

Canonical Corpus v11 requires AccountFinanceZone to be the _finance-only_
context with "no mixing of concerns," and models a three-bucket wallet where
`rewards` (RedRoomRewards points) and `cash` are distinct.

**What is correctly separated:**

- The wallet bucket model keeps `promotional`, `rewards`, and `cash` distinct
  and enforces spend order (`src/wallet/wallet.service.ts:27,39`). Rewards
  points are never directly convertible to a cash payout in code. ✅
- Creator **payouts** (cash owed for revenue share / theatre linger) are
  computed from real transaction/ticket amounts, not from reward points. ✅
- VIP "refunds" land in the `promotional` bucket, never cash
  (`transaction.service.ts:99`). ✅

**Where concerns are blended (fix):**

1. **Revenue-share _policy_ lives inside finance.** The tier → BPS table is
   hardcoded in `BillingService` (`billing.service.ts:27`). Tier/entitlement
   is a Rewards/AccountsZone product concern; finance should _consume_ the
   effective rate via the cross-zone contract (an `AccountLinkingEvent` /
   entitlement payload), not own the pricing matrix. As written, a rewards
   pricing change requires a finance deploy. **Recommendation:** treat BPS as
   an input on the money-movement request, sourced from the owning domain;
   finance validates bounds (0–10000) and does the math only.
2. **Account-linking state held in finance memory** (`billing.service.ts:36`).
   Fan→creator linkage is a relationship/identity fact; finance should resolve
   it per-transaction from the event/contract rather than maintaining its own
   mutable map. **Recommendation:** pass `creatorAccountId` on the request, or
   resolve via a read-model, and remove the in-memory map.
3. **Wallet `rewards` bucket is never persisted or reconciled** against any
   RedRoomRewards source of truth — today it is pure computation. When wired,
   the rewards-bucket balance must originate from the Rewards zone (escrow
   release events), with finance recording only the ledger effect, preserving
   the boundary.

Target boundary, stated plainly: **Rewards/Marketplace/ChatNow decide _what is
owed and at what rate_; AccountFinanceZone decides _how money moves and records
it immutably_.** Policy in, ledger out.

---

## 7. Recommended improvements (sequenced)

**Phase 1 — Durability & audit (unblocks production; P0).**

1. Back `LedgerService.appendEntry` with `prisma.ledgerEntry.create`; make
   reads query Postgres. Append-only; corrections via OFFSET rows only.
   (Touches `src/ledger/**` → human review.)
2. Wire `AuditService` into an `AuditModule` and call `recordEvent` on every
   money movement (payment, payout issue/settle/fail, chargeback, theatre
   settle). Co-write audit in the same DB transaction as the ledger row.
3. Persist `Transaction`, `Payout`, and `FraudAssessment` rows so the schema's
   append-only tables reflect runtime reality.
4. Move idempotency to a durable, unique-constrained store (e.g. a
   `processed_idempotency_keys` table or a unique key on `Transaction`) checked
   transactionally before the debit. (Closes C-1, F-5, A-1/A-2/A-3.)

**Phase 2 — Atomicity & concurrency (P1).**

1. Wrap each multi-step movement in `prisma.$transaction`: theatre settle
   (ledger + audit + status), payout settle (settlement + request status +
   ledger + audit).
2. Add a partial unique index enforcing one active `PayoutRequest` per creator
   (status in PENDING/APPROVED/PROCESSING) to close C-2 at the DB layer.
3. Add compensating-reversal logic (OFFSET entries) on theatre/payout failure
   paths (C-4, F-3).

**Phase 3 — Integration hardening (P1).**

1. Implement a **transactional outbox** for finance events; relay to eCommsZone
   with retry + dead-letter (F-1).
2. Replace the compliance stub with a real OmniComplianceZone call (timeout,
   fail-closed) (F-4).
3. Implement real Stripe charge + **webhook ingress** (signature-verified) so
   chargebacks flow into `ChargebackService`; normalize to CAD/residency (§4
   Stripe row, §3.2).
4. Make NOWPayments settlement two-phase: create settlement `PENDING`, call
   processor, advance to `SETTLED` only on confirmation, store the real
   `external_ref` (F-2).

**Phase 4 — Escrow & checkout (P1/P2).**

1. Implement the Escrow/Hold matrix (`pending_hold`, `dispute_hold`,
   `payout_reserve`) as ledger-backed locked balances with audited
   lock/unlock events (Corpus §5).
2. Implement Universal Checkout Confirmation as the precondition for any debit
   (Corpus §8), using the existing `CheckoutConfirmation` type.

**Phase 5 — Separation of concerns (P2).**

1. Externalize revenue-share BPS and fan→creator linkage out of
   `BillingService` per §6; fix the `BillingModule`→`PayoutsModule` wiring
   defect (§4.1).
2. Converge the two payout systems on the DB-backed model as the single
   source of creator-owed balance (A-4).

---

## 8. Payments / Payouts readiness summary

| Capability                               | Documented | Implemented      | Durable & audited            | Verdict                      |
| ---------------------------------------- | ---------- | ---------------- | ---------------------------- | ---------------------------- |
| Payment processing                       | ✅         | partial (in-mem) | ❌                           | **Not ready**                |
| Append-only ledger                       | ✅         | in-memory only   | ❌                           | **Not ready**                |
| Idempotency / double-spend               | ✅         | in-memory only   | ❌                           | **Not ready**                |
| No-cash-refund / VIP credit              | ✅         | ✅               | ❌ (in-mem)                  | Logic ready, persistence not |
| Chargeback assembler                     | ✅         | ✅ (no ingress)  | ❌                           | Partial                      |
| Escrow / holds                           | ✅         | ❌               | ❌                           | **Not ready**                |
| Checkout confirmation                    | ✅         | ❌               | ❌                           | **Not ready**                |
| Revenue-share math                       | ✅         | ✅               | ❌                           | Logic ready                  |
| Payout request/settlement                | ✅         | ✅ (DB)          | partial (no audit/atomicity) | Partial                      |
| Theatre/linger payouts                   | ✅         | ✅               | ❌ (in-mem ledger)           | Partial                      |
| Audit trail                              | ✅         | ✅ (unwired)     | ❌                           | **Not ready**                |
| Compliance gating                        | ✅         | stub             | n/a                          | **Not ready**                |
| External processors (Stripe/NOWPayments) | ✅         | stub             | ❌                           | **Not ready**                |
| Event delivery (eCommsZone)              | ✅         | ✅ (no outbox)   | ❌                           | Partial                      |
| Encryption at rest (payout prefs)        | ✅         | ✅               | ✅                           | **Ready**                    |
| Revenue-share BigInt precision           | ✅         | ✅               | n/a                          | **Ready**                    |

**Bottom line:** The design and contracts are sound and the hard money-math,
encryption, and no-refund invariants are correctly implemented. The blocking
gap is that the **durability, atomicity, and audit** guarantees are not yet
enforced at runtime — the ledger, audit, and idempotency live in memory and
the DB financial tables are unwritten. **Do not move real money until Phase 1
and Phase 2 are complete.** None of the gaps are architectural dead-ends: the
schema and audit primitives already exist and need wiring, sequenced in §7.

See `docs/architecture/financial-flows.md` for the target-state flow patterns
that these recommendations converge on.
