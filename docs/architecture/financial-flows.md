# Financial Flow Patterns — AccountFinanceZone

> Version: 1.0 (2026-06-20)
> Rule applied: `GOVERNANCE-EQ-v1`
> Status: target-state architecture. Where the current runtime diverges, the
> divergence is called out inline and tracked in
> [`docs/payments-and-payouts-review.md`](../payments-and-payouts-review.md).

This document describes the canonical patterns every money-movement path in
AccountFinanceZone must follow. It exists so that new flows are built the same
way and existing flows can be measured against a single reference.

---

## 1. Boundary principle: "policy in, ledger out"

AccountFinanceZone is the **finance-only** bounded context and the **sole
writer of the ledger**. Other zones decide _what is owed_; finance decides
_how money moves and how it is recorded immutably._

```text
  Rewards / Marketplace / ChatNow / AccountsZone
  (entitlements, tiers, rates, what-is-owed)
                     │  contract event / request input
                     ▼
        ┌─────────────────────────────┐
        │      AccountFinanceZone      │   ← only ledger writer
        │  guard → move → record → emit│
        └─────────────────────────────┘
                     │  receipt event (read-only fan-out)
                     ▼
            eCommsZone receipt bus → downstream OQMI
```

Consequences:

- Pricing/rate policy (e.g. tier → revenue-share BPS) is an **input** to
  finance, not state owned by finance. Finance validates bounds and computes;
  it does not author the policy. (Current gap: `BillingService` hardcodes the
  BPS table — see review §6.)
- No service outside this context may write to the ledger. Inbound zones send
  events/requests; finance owns the write.

---

## 2. The canonical money-movement pattern

Every debit or credit MUST pass through these stages, in order, inside a
**single database transaction** for the durable stages:

```text
1. AUTHENTICATE   caller identity (gateway header / pre-auth token)
2. IDEMPOTENCY    durable, unique-constrained check  ── reject replays
3. GUARD          compliance (fail-closed) + fraud   ── may BLOCK
4. ALLOCATE       wallet bucket order: promotional → rewards → cash
        ┌─────────────── BEGIN DB TRANSACTION ───────────────┐
5. LEDGER         append immutable entry (CREDIT/DEBIT/OFFSET)
6. AUDIT          write audit_trail row (same txn as ledger)
7. STATE          advance aggregate status (forward-only)
8. OUTBOX         enqueue event row (same txn)
        └─────────────── COMMIT ──────────────────────────────┘
9. RELAY          outbox worker delivers event to eCommsZone (retry+DLQ)
```

Rules that make the pattern safe:

- **Atomic core (5–8) commit together or not at all.** Never write a ledger
  entry without its audit row and outbox row in the same transaction.
- **Idempotency before side effects.** The key is checked and reserved
  durably (unique constraint) so a replay can never reach stage 5.
- **Fail-closed guards.** A compliance/fraud dependency error blocks the
  movement; it never silently allows it.
- **Forward-only state.** Status transitions are monotonic and claimed with an
  optimistic guard (`updateMany WHERE status = <expected>`), so concurrent
  workers cannot double-process.
- **Events via outbox, never inline fire-and-forget.** Delivery is decoupled
  and retryable so a crash cannot lose a financial receipt.

### Current vs. target

| Stage       | Target                        | Today                                         |
| ----------- | ----------------------------- | --------------------------------------------- |
| Idempotency | durable unique key            | in-memory `Set` (`transaction.service.ts:19`) |
| Ledger      | `prisma.ledgerEntry` append   | in-memory array (`ledger.service.ts:24`)      |
| Audit       | `audit_trail` row in txn      | `AuditService` exists, **never called**       |
| Atomicity   | `prisma.$transaction`         | no `$transaction` anywhere                    |
| Outbox      | transactional outbox + worker | fire-and-forget (`event.publisher.ts:15`)     |

---

## 3. Correction pattern (append-only)

Financial data rows are never updated or deleted. Corrections are **new
offsetting entries**.

```text
original:   LedgerEntry{ id: E1, DEBIT,  amountMinor: 1000 }
correction: LedgerEntry{ id: E2, OFFSET, amountMinor: 1000, offsetOfEntryId: E1 }
```

- Refunds are **not** a reversal primitive. The VIP Refund Protocol re-issues
  value as a `promotional` wallet credit, never as cash
  (`transaction.service.ts:99`). ✅ implemented.
- Chargebacks register an `OFFSET` referencing the original entry
  (`transaction.service.ts:129`) and are packaged immutably by
  `ChargebackService`. Bank-initiated, never system-initiated.

---

## 4. Escrow / hold pattern (target — not yet implemented)

Funds under dispute or pending payout are **locked, not deducted**. Model holds
as ledger-backed locked balances with audited lifecycle events.

```text
hold types:  pending_hold · dispute_hold · payout_reserve

  LOCK    → append hold entry (reduces spendable, not total) + audit
  UNLOCK  → explicit event (webhook/admin) → release entry + audit
            never auto-released without an audited trigger
```

Chargeback funds are reserved against **merchant/creator payout**, not the
user wallet (Canonical Corpus v11 §5–§6).

---

## 5. Payout flow pattern (converged target)

Today there are two payout paths (in-memory revenue-share vs. DB request/
settlement) that do not reconcile. Target: a **single DB-backed model** is the
authoritative record of creator-owed balance.

```text
  earn event (revenue share / theatre linger)
        │
        ▼
  Ledger CREDIT (creator) + audit            ── what we owe
        │
  creator submits PayoutRequest (≥ $50, one active per creator)
        │   PENDING ──(optimistic claim)──▶ PROCESSING
        ▼
  Settlement: create PayoutSettlement(PENDING)
        │   call rail (e-transfer / NOWPayments / manual)
        ▼   ── advance to SETTLED only on processor confirmation
  PayoutRequest SETTLED + Ledger DEBIT(payout_reserve) + audit + outbox
```

Guards: one active request per creator (DB partial unique index), two-phase
settlement (no `SETTLED` before confirmation), compensating OFFSET on failure.

---

## 6. Settlement state machines

```text
PayoutRequest:   PENDING → APPROVED → PROCESSING → SETTLED
                                   └──────────────→ FAILED
                 PENDING → CANCELLED
                 (forward-only; claimed via updateMany guard)

TheatreShow:     ACTIVE → SETTLING → SETTLED
                              └────→ FAILED  (+ compensating reversal)

Chargeback:      OPEN → EVIDENCE_SUBMITTED → RESOLVED_WON | RESOLVED_LOST
                 (transitions validated in ChargebackService)
```

---

## 7. Integration contract summary

| Zone                   | Direction | Contract                | Pattern requirement                          |
| ---------------------- | --------- | ----------------------- | -------------------------------------------- |
| OmniComplianceZone     | out       | pre-movement evaluate   | fail-closed, timeout-bounded                 |
| Stripe                 | in/out    | charge + signed webhook | webhook → ChargebackService ingress          |
| NOWPayments            | out       | crypto payout rail      | two-phase, confirmation-gated                |
| eCommsZone             | out       | webhook v1.1 + HMAC     | via transactional outbox + retry/DLQ         |
| AccountsZone / Rewards | in        | tier/link events        | supply rate & linkage as input (policy-in)   |
| GateGuard              | in        | pre-auth token          | required before any debit (checkout confirm) |

See [`../INTEGRATION_CONTRACT.md`](../INTEGRATION_CONTRACT.md) and
[`../../WEBHOOK_CONTRACTS.md`](../../WEBHOOK_CONTRACTS.md) for payload shapes.

---

## 8. Invariants checklist (every new flow must satisfy)

- [ ] Durable, append-only ledger write (no UPDATE/DELETE on financial rows)
- [ ] `rule_applied_id` + `auditTraceId`/`correlation_id` on every write
- [ ] `audit_trail` row written in the same transaction as the ledger entry
- [ ] Durable idempotency check before any side effect
- [ ] Compliance + fraud guard before ledger append (fail-closed)
- [ ] Wallet spend order enforced: promotional → rewards → cash
- [ ] Multi-step movement wrapped in a single DB transaction
- [ ] Forward-only status transitions claimed with optimistic guards
- [ ] Events emitted via transactional outbox (no inline fire-and-forget)
- [ ] No cash refunds — promotional credit only
- [ ] CAD / `ca-central-1` residency
