# Canonical Corpus v11 — AccountFinanceZone Invariants

> **Scope:** AccountFinanceZone is the immutable financial ledger for OmniQuest Media Inc.
> All balance changes MUST flow through this service via append-only ledger entries.
> No UI logic, no non-financial domain logic, no mixing of concerns.

---

## 1. Append-Only Ledger Invariant

- Every balance mutation MUST be recorded as a new ledger entry (INSERT only — no UPDATE or DELETE on ledger rows).
- Ledger entries are immutable once written. Corrections are new offsetting entries with a `correctionOf` reference.
- Schema enforcement: `ledger_entries` table must have no UPDATE/DELETE grants in production.
- Violation = critical defect, blocks migration gate.

## 2. Three-Bucket Wallet (Spend Order Enforced)

All wallet balances are segmented into three buckets, debited in strict order:

| Priority | Bucket        | Description                                      |
| -------- | ------------- | ------------------------------------------------ |
| 1        | `promotional` | Promotional/bonus credits — spent first          |
| 2        | `rewards`     | RedRoomRewards earned credits — spent second     |
| 3        | `cash`        | Real money / payment-backed funds — spent last   |

- No out-of-order debit is permitted. A transaction that skips bucket order is rejected.
- Bucket balances must each be >= 0 at all times (no negative balance per bucket).
- Total wallet balance = sum of all three buckets.

## 3. Diamond DFSP (Diamond Financial Service Provider Stack)

- AccountFinanceZone is the sole authority for ledger writes.
- GateGuard enforces pre-authorization before any debit.
- RedRoomRewards escrow holds reward credits until release conditions are met.
- eCommsZone receipt bus receives confirmed transaction events (read-only fan-out).
- No service outside AccountFinanceZone may write directly to the ledger.

## 4. No-Refund Enforcement (Universal)

- Refunds are not supported as a reversal primitive.
- VIP Refund Protocol: refunds are re-issued as promotional credits to bucket 1, NOT as cash reversals.
- Chargeback disputes are handled by the chargeback package assembler — these are bank-initiated, not system-initiated refunds.
- No API endpoint may issue a cash refund. Any such endpoint is a critical defect.

## 5. Escrow & Hold Matrix

- Funds under dispute or pending payout are held in escrow (locked balance, not deducted from wallet).
- Hold matrix: `pending_hold`, `dispute_hold`, `payout_reserve`.
- Escrow release requires an explicit unlock event (webhook or admin action with audit trail).

## 6. Chargeback Dispute Package

- Chargeback events arrive via payment processor webhook (Stripe).
- The chargeback assembler packages: original transaction, ledger snapshot, GateGuard pre-auth record, eCommsZone receipt.
- Package is immutable once assembled; only status transitions are allowed.
- Chargeback funds are held from merchant payout, not from user wallet.

## 7. FINTRAC / AML Posture

- All transactions >= CAD $10,000 (or equivalent) trigger AML flag for manual review.
- Structuring detection: 3 or more transactions totalling >= $10,000 in a 24h window flags for review.
- PEP/OFAC screening on account creation and on transactions >= $1,000.
- AML flags are non-deletable ledger annotations.

## 8. Universal Checkout Confirmation

- No funds are debited until checkout confirmation event is received and validated.
- Confirmation must include: `transactionId`, `userId`, `amount`, `bucketBreakdown`, `gateguardAuthToken`.
- Double-spend prevention: idempotency key checked against ledger before any debit.

---

## Enforcement Gates (Pre-Merge Checklist)

- [ ] No `UPDATE`/`DELETE` on `ledger_entries` in any migration
- [ ] Bucket spend order enforced in `WalletService.debit()`
- [ ] No cash refund endpoints exist
- [ ] Chargeback assembler tests passing
- [ ] AML threshold checks active
- [ ] Idempotency key validation on all debit paths
- [ ] Escrow lock/unlock audit trail populated
- [ ] CI financial-invariants check green
