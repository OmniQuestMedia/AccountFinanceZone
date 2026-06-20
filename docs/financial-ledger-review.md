# Financial Ledger Integrity Review — AccountFinanceZone

> **Date:** 2026-06-20
> **Scope:** Core financial ledger — immutability, auditability, reliable
> transaction handling, and separation from loyalty/rewards logic.
> **Reviewer:** Engineering collaborator (Daily Working Agreement).
> **Reference:** [`docs/standards/CANONICAL_CORPUS_v11_INVARIANTS.md`](./standards/CANONICAL_CORPUS_v11_INVARIANTS.md)

This review audits the current ledger, identifies gaps in immutability,
error handling, rollback, and concurrency, and records the hardening already
applied plus the remaining work as small, reviewable tasks.

---

## 1. Components Reviewed

| Concern | File |
| --- | --- |
| Ledger write path | `src/ledger/ledger.service.ts` |
| Transaction orchestration | `src/transactions/transaction.service.ts` |
| Write context (`rule_applied_id`, `correlation_id`) | `src/common/types.ts` |
| Event emission | `src/events/event.publisher.ts`, `src/events/event.types.ts` |
| Audit trail | `src/common/audit.service.ts` |
| Wallet / three-bucket spend (loyalty boundary) | `src/wallet/wallet.service.ts` |
| Persistence model | `prisma/schema.prisma` (`LedgerEntry`, `AuditTrail`) |

---

## 2. Findings

### 2.1 Immutability & append-only behavior

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F-1 | Ledger entries were plain objects returned by reference — a caller could mutate `amountMinor`/`entryType` in place. Append-only was convention, not enforced. | **High** | **Fixed** — entries are now `Object.freeze`d at write time. |
| F-2 | No hash chaining. The ledger was not tamper-evident; a reorder/edit/delete of an in-memory entry was undetectable. The task explicitly called this out. | **High** | **Fixed** — sha256 `prevHash → entryHash` chain with a genesis hash, plus `verifyIntegrity()`. |
| F-3 | Ledger state lives in an in-memory array (`private entries: LedgerEntry[]`) and is **not** persisted through the existing Prisma `LedgerEntry` model. State is lost on restart and not shared across instances. | **Critical** | Open — see T-1. |
| F-4 | Doc/schema drift: Invariant 1 references a `correctionOf` field; code and schema use `offsetOfEntryId`. | Low | Open — see T-5. |

### 2.2 Financial event recording (`correlation_id`, `rule_applied_id`, hash chaining)

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F-5 | `rule_applied_id` is required and threaded correctly on every ledger write. | — | OK (verified). |
| F-6 | `correlation_id` existed on payout/theatre models but was **absent** from the core ledger and transaction write context — no cross-service correlation on the primary ledger. | Medium | **Fixed** — `correlationId` added to `FinancialWriteContext` and persisted on each ledger entry; it flows through `TransactionService` unchanged because the whole context object is forwarded. |
| F-7 | Ledger writes are not mirrored into the `AuditTrail` table. `AuditService.recordLedgerEvent()` exists but is never called from the ledger path. | Medium | Open — see T-3. |

### 2.3 Error handling, rollback, concurrency

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F-8 | **Idempotency ordering bug** (`transaction.service.ts:30-37`): the idempotency key is marked consumed *before* compliance/fraud checks. A payment blocked by fraud leaves the key consumed, so a legitimate retry is rejected as `Duplicate` even though **no ledger entry was ever written**. | **High** | Open — see T-2. |
| F-9 | Idempotency keys are held in an in-memory `Set`. No double-spend protection survives a restart or spans instances — violates Invariant 8.3 ("idempotency key checked against ledger before any debit"). | **Critical** | Open — see T-2. |
| F-10 | No transactional boundary. Ledger append and event publish are sequential and non-atomic; `EventPublisher.publish` is fire-and-forget (`void`), so a failed publish silently diverges the receipt bus from the ledger. There is no rollback/compensation. | **High** | Open — see T-4. |
| F-11 | Input validation was limited to `ruleAppliedId`. Zero/negative amounts, malformed currency codes, and dangling `OFFSET` references were all accepted. | Medium | **Fixed** — `validateInput()` now enforces positive amounts, ISO-4217-shaped currency codes, required `accountId`/`auditTraceId`, and that every `OFFSET` references a real prior entry. |

### 2.4 Separation of ledger vs. loyalty/rewards logic

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F-12 | `LedgerService` itself contains **no** loyalty/rewards logic — it records double-entry primitives only. Good separation at the ledger core. | — | OK (verified). |
| F-13 | `TransactionService.issueVipRefundAsCredit()` couples a wallet/loyalty action (`WalletService.issuePromotionalCredit`) with a ledger `CREDIT` in one method, with no transactional link. The bucket/loyalty concept ("promotional") leaks into the orchestration layer. | Medium | Open — see T-6. Acceptable short-term (orchestration is the correct seam) but should be made atomic and explicitly documented. |

---

## 3. Hardening Applied in This Change

Scope was deliberately limited to the in-memory `LedgerService` so the change
is small and reviewable, with no schema migration. All 147 tests, lint, and
build pass.

1. **Tamper-evident hash chain** — every entry carries `sequence`, `prevHash`,
   and a sha256 `entryHash` over a deterministic, field-ordered serialization
   (bigints stringified for stability). First entry chains from a fixed
   genesis hash.
2. **`verifyIntegrity()`** — recomputes the chain from genesis and reports the
   first broken sequence on reorder, edit, or deletion. This is the auditable
   proof the append-only log is intact.
3. **Runtime immutability** — entries are `Object.freeze`d on write.
4. **`correlation_id` threading** — added to `FinancialWriteContext` and
   persisted on each entry for cross-service audit/reconciliation.
5. **Stronger validation** — positive `amountMinor`, ISO-4217-shaped currency,
   required `accountId`/`auditTraceId`, and verified `OFFSET` references.
6. **Tests** — 6 new cases covering validation, hashing, freezing, tamper
   detection, and correlation threading.

---

## 4. Remaining Work — Small, Reviewable Tasks

> Ordered by risk. T-1/T-2 are migration-gate blockers (Critical findings).

- **T-1 — Persist the ledger via Prisma (Critical, F-3).**
  Back `LedgerService` with the `LedgerEntry` table. Persist `sequence`,
  `prevHash`, `entryHash`, `correlationId`. Add a DB-level guard (no
  `UPDATE`/`DELETE` grants in production) per Invariant 1. ~1 focused PR +
  migration.

- **T-2 — Durable, correctly-ordered idempotency (Critical, F-8/F-9).**
  Move idempotency to a persisted unique key checked **before any debit** and
  recorded only **after** a successful, committed write — so a fraud/compliance
  rejection does not consume the key. Enforce with a unique DB constraint.

- **T-3 — Mirror ledger writes into `AuditTrail` (Medium, F-7).**
  Call `AuditService.recordLedgerEvent()` inside the ledger write within the
  same transaction as T-1.

- **T-4 — Atomic write + outbox for events (High, F-10).**
  Wrap ledger append + audit + event enqueue in one DB transaction using a
  transactional outbox; publish to eCommsZone from the outbox so a publish
  failure cannot diverge from the committed ledger.

- **T-5 — Resolve `correctionOf` vs `offsetOfEntryId` drift (Low, F-4).**
  Pick one term; align Invariant 1, schema, and code.

- **T-6 — Make VIP credit issuance atomic and document the boundary (Medium, F-13).**
  Bind the wallet credit and ledger `CREDIT` in one transaction (T-1/T-4) and
  document the orchestration seam between ledger and loyalty/rewards.

---

## 5. Ledger Integrity Health Summary

| Dimension | Before | After this change | Residual risk |
| --- | --- | --- | --- |
| Append-only enforced | Convention only | **Runtime-frozen + hash chain** | Gone (in-memory); DB grants pending T-1 |
| Tamper-evident | ❌ None | ✅ sha256 chain + `verifyIntegrity()` | None in-memory |
| `rule_applied_id` | ✅ Required | ✅ Required | None |
| `correlation_id` on ledger | ❌ Absent | ✅ Threaded & persisted-on-entry | DB persistence pending T-1 |
| Input validation | Minimal | ✅ Amount/currency/offset/account | None |
| Durable persistence | ❌ In-memory | ❌ In-memory | **Critical — T-1** |
| Double-spend / idempotency | ❌ In-memory, mis-ordered | ❌ Unchanged | **Critical — T-2** |
| Atomic write + events | ❌ Non-atomic, fire-and-forget | ❌ Unchanged | **High — T-4** |
| Ledger ↔ loyalty separation | Mostly clean | Clean at core; orchestration noted | Medium — T-6 |

**Overall:** 🟡 **Yellow — improving, not yet migration-ready.** The ledger is
now tamper-evident, immutable at runtime, correlatable, and validated. Two
Critical gaps remain before the migration gate can pass: **durable persistence
(T-1)** and **durable, correctly-ordered idempotency (T-2)**. Recommend
scheduling T-1 and T-2 first; T-3/T-4 follow naturally within the same
persistence/transaction work.
