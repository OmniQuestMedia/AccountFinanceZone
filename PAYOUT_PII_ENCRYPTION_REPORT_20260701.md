# Payout-Destination PII Encryption Report (A14)

**Date:** 2026-07-01
**Authority:** ARCHITECTURE_CANON_ADDENDUM_A §A14 (Kevin ruling 2026-07-01) — payout destinations stay in Finance, encrypted at rest.
**Branch:** `claude/payout-pii-encrypt-20260701` (off `origin/main`)
**Code commit:** `d59f8ea`
**Posture:** push-only, no PR. Schema push + backfill are **gated to Kevin**.

---

## 1. What changed

| File                                               | Change                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/payouts/creator-payout-preference.service.ts` | Encrypt `etransfer_email` + `crypto_wallet_address` on write via the **existing** `EncryptionService` (same AES-256-GCM path/key as the JSON blobs — no new key, algorithm, or env var). New `decryptScalar()` on read decrypts and **tolerates legacy plaintext** (try-decrypt, fall back to raw). |
| `prisma/schema.prisma`                             | Widen both columns `@db.VarChar(200)` → `@db.Text` (ciphertext overflows 200). Ledger models untouched.                                                                                                                                                                                             |
| `PCI_SCOPE_MINIMIZATION.md`                        | Add both fields to the §5.1 encrypted-fields list; record the A14 in-scope-encrypted ruling and the column widen.                                                                                                                                                                                   |
| `test/creator-payout-preference.service.spec.ts`   | +4 tests (below) using the real `EncryptionService`.                                                                                                                                                                                                                                                |
| `scripts/backfill-payout-pii-encryption.ts`        | **New** gated, idempotent encrypt-if-plaintext one-off (outside the build/lint/test perimeter).                                                                                                                                                                                                     |

Encryption path is unchanged and reused: format `iv:authTag:base64(data)`, key derived from `ENCRYPTION_MASTER_KEY` (env / KMS in prod). Scalar fields store the raw ciphertext string (the JSON blobs keep their `{ encrypted: ... }` envelope).

---

## 2. Ciphertext-length finding — column widen WAS required

Measured with the real `EncryptionService` (`iv:authTag:base64` format):

| Input                        | Plaintext len | Ciphertext len | Fits `VarChar(200)`? |
| ---------------------------- | ------------- | -------------- | -------------------- |
| Typical email                | 26            | 86             | yes                  |
| Long email                   | 84            | 162            | yes                  |
| BTC address                  | 34            | 98             | yes                  |
| ETH address                  | 42            | 106            | yes                  |
| Monero-style address         | 95            | 178            | yes (tight)          |
| **Max `VarChar(200)` input** | **200**       | **318**        | **NO — overflows**   |

Overhead is fixed ~50 chars (iv 24 + tag 24 + 2 colons) plus 4/3 × plaintext. A max-length source value produces **318 chars**, exceeding 200. **Both columns were widened to `@db.Text`** (unbounded — can never overflow). Non-destructive change (VarChar→Text widens, no truncation).

---

## 3. GATED — schema push (Kevin's box)

Schema-push posture (no `prisma/migrations/`). After pulling this branch, on a host with `DATABASE_URL` set:

```bash
# Widens etransfer_email + crypto_wallet_address to TEXT. Non-destructive.
npx prisma db push
```

`prisma db push` also regenerates the client. VarChar(200)→Text is a widening with no data loss, so **no `--accept-data-loss` flag is needed**. Do this **before** the backfill (§4). This is Kevin's step — not run here.

---

## 4. GATED — backfill (Kevin's box)

Legacy plaintext rows must be encrypted in place. `scripts/backfill-payout-pii-encryption.ts` is idempotent: a value that already decrypts is treated as already-encrypted and skipped, so re-running is safe. Never logs plaintext/ciphertext — only row id + field names.

```bash
# 1) Preview (no writes) — also reports the plaintext row count:
npx ts-node scripts/backfill-payout-pii-encryption.ts --dry-run

# 2) Apply (encrypt-if-plaintext), AFTER `prisma db push`:
npx ts-node scripts/backfill-payout-pii-encryption.ts
```

Requires `DATABASE_URL` + `ENCRYPTION_MASTER_KEY` in the environment (same key the service uses — never hard-coded). This is a data migration on the ledger-adjacent DB → **doctrine-gated, Kevin runs it**.

### Current plaintext-row count

**Not measurable from this ephemeral container** — no `DATABASE_URL` / no reachable Postgres here. The exact count is produced by the `--dry-run` above (it detects plaintext via try-decrypt). A quick SQL upper bound (non-null rows) for Kevin:

```sql
SELECT count(*) AS non_null_rows
FROM creator_payout_preferences
WHERE etransfer_email IS NOT NULL OR crypto_wallet_address IS NOT NULL;
```

In pre-Beta this is expected to be only dummy data (likely 0–few rows). The read path already tolerates any un-backfilled plaintext, so there is no breakage window.

---

## 5. Tests added (+4, all green)

In `test/creator-payout-preference.service.spec.ts`, new describe block using the real `EncryptionService` (test-only dummy key):

1. **ciphertext at rest** — `etransfer_email` + `crypto_wallet_address` are stored in `iv:authTag:data` form, not equal to plaintext, and decrypt back to the original.
2. **read round-trip** — an encrypted row decrypts to the original on `getByCreatorId` (incl. a 95-char address).
3. **legacy plaintext tolerance** — a pre-A14 plaintext row is returned raw (no throw).
4. **null passthrough** — absent scalar PII stays `null` (no encryption of empty).

Existing tests (JSON-blob encryption, validation, not-found) are unchanged and still pass.

---

## 6. Verification (local — no branch CI)

Prisma client regenerated against the widened schema (offline; engine cached). All gates green **after** the change:

| Gate       | Command                                         | Result                                  |
| ---------- | ----------------------------------------------- | --------------------------------------- |
| Lint       | `eslint {src,test}/**/*.ts`                     | ✅ exit 0                               |
| Type-check | `tsc --noEmit`                                  | ✅ exit 0                               |
| Tests      | `jest`                                          | ✅ 188 passed / 23 suites (was 184; +4) |
| Build      | `tsc -p tsconfig.build.json`                    | ✅ `dist/main.js`                       |
| Ship-gate  | `ts-node PROGRAM_CONTROL/ship-gate-verifier.ts` | ✅ passed (exit 0)                      |

Backfill script type-checked standalone (outside the tsconfig include): ✅ clean.

**Untouched, as mandated:** ledger schema/models (`LedgerEntry`/`AuditTrail`/`Transaction`), `financial-invariants-check.yml`, the Accounts↔Finance opaque-key firewall, and `PaymentMethodToken`. No new key/algorithm/env var. No real secret in any commit (test key is a clearly-dummy fixture).

=== PAYOUT-PII ENCRYPTION COMPLETE (schema push + backfill GATED to Kevin) ===
