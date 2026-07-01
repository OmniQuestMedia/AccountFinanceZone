# AccountFinanceZone — Hygiene Audit Report

**Date:** 2026-07-01
**Operator:** OmniQuest Senior Executive Architect & Lead Code Engineer (single writer)
**Rule applied:** GOVERNANCE-EQ-v1
**Mode:** Read-only audit → §4B safe-fixes only → surface §5 → local verify → push (no PR)

---

## 1. Sync line

|                     |                                                               |
| ------------------- | ------------------------------------------------------------- |
| Branch              | `claude/hygiene-audit-8sj5lp` (off `origin/main`)             |
| `origin/main`       | `b764295177558006c2319935874594b68e9b22af`                    |
| HEAD (pushed)       | `385d9ad8c735b63ba737d22dc7a689dfa04a7971`                    |
| Divergence at start | 0 ahead / 0 behind `origin/main` (clean)                      |
| Pushed              | yes — `origin/claude/hygiene-audit-8sj5lp` (push-only, no PR) |

---

## 2. Findings table

| #     | Dimension                                        | Verdict                               | Evidence (path:line)                                                                        | Disposition                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4A#1  | Clean-state gate (lint/tsc/test/build/ship-gate) | **CONFIRMED green**                   | see §5 verification                                                                         | Verified locally after install workaround                                                                                                                                                                                                                                                         |
| 4A#1  | Coverage vs TECH_DEBT report                     | **NEW (drift, benign)**               | `TECH_DEBT_AND_COVERAGE_REPORT.md:44-51`                                                    | Report snapshot 163 tests/18 suites @84.29% stmts; **actual now 184 tests/23 suites @85.3% stmts / 87.37% lines**. Suite grew since report; coverage in same band. No regression. Dated snapshot — not edited.                                                                                    |
| 4A#2  | Prisma 5 vs program-standard 6                   | **CONFIRMED**                         | `package.json:24,38` both `^5.22.0`                                                         | Cross-repo major divergence. **SURFACED (§5.3)** — gated major, not a safe-fix.                                                                                                                                                                                                                   |
| 4A#2  | eslint `^10.4.0` resolves?                       | **REFUTED (no issue)**                | `package-lock.json` → `eslint@10.4.0` (real published)                                      | Resolves to a real version. No correction needed.                                                                                                                                                                                                                                                 |
| 4A#2  | Other pins (ts 5.7, @types/node 22, NestJS 11)   | **CONFIRMED sane**                    | `package.json:21-41`                                                                        | No action.                                                                                                                                                                                                                                                                                        |
| 4A#3  | `engines` field absent                           | **CONFIRMED**                         | `package.json` (was absent)                                                                 | **FIXED (§4B)** — added `"engines": { "node": ">=20" }`.                                                                                                                                                                                                                                          |
| 4A#4  | Lockfile present/current                         | **CONFIRMED**                         | `package-lock.json` (481 resolved entries); CI uses `npm ci`                                | Committed & current. Not regenerated. **NEW:** a stale `yarn.lock` also exists (dual lockfile) — see §5.9.                                                                                                                                                                                        |
| 4A#5  | Prisma posture (env-only, migrations)            | **CONFIRMED**                         | `prisma/schema.prisma:5-8` `url = env("DATABASE_URL")`                                      | No inline secret. **No `prisma/migrations/` dir** and no `migration_lock.toml` (schema-push posture). Append-only models `LedgerEntry`, `AuditTrail` present. No schema/migration change made.                                                                                                    |
| 4A#6  | Phantom-import sweep                             | **REFUTED**                           | `src/**`, `services/**`                                                                     | No `*orchestrator*`, `../core-api/*`, `../accounts/*`, `../redroomrewards/*`, or other non-resolving imports. All imports resolve to internal modules or real deps.                                                                                                                               |
| 4A#7  | Stale-branch inventory                           | **REFUTED**                           | `git branch -r`                                                                             | Remote holds only `origin/main` + this working branch. All named stale branches (adoring-fermat, affectionate-darwin, gracious-hypatia, jolly-turing, magical-cori, copilot/run-hygiene-audit) are **already deleted**. Nothing to prune. Docs still referencing them are stale snapshots (§5.8). |
| 4A#8  | Dependabot / advisories                          | **CONFIRMED (5 advisories)**          | `npm audit`                                                                                 | 2 non-breaking dev-transitive (@babel/core, js-yaml); 3 high on `multer` whose only offered fix is a **breaking NestJS downgrade**. **SURFACED (§5.10)** — none auto-applied (all touch the gated lockfile).                                                                                      |
| 4A#9  | CI + financial-invariants intact                 | **CONFIRMED intact**                  | `.github/workflows/financial-invariants-check.yml`                                          | Encodes ledger-mutation guard, hardcoded-live-key scan, cash-refund scan, three-bucket check. **Not modified** (governance → §5).                                                                                                                                                                 |
| 4A#10 | No identity graph / firewall                     | **CONFIRMED intact**                  | `src/**`                                                                                    | No name→account resolver, no token→name capability. Finance keys anonymously by `accountId`/`creator_id`/`guest_id` (opaque IDs/UUIDs). Event egress carries no PII (`src/events/ecomms-zone.client.ts`).                                                                                         |
| 4A#10 | Payout-destination PII / PCI scope               | **CONFIRMED (known signal)**          | `prisma/schema.prisma:147-161`                                                              | `CreatorPayoutPreference` holds `etransfer_email` (152), `mailing_address` (153), `crypto_wallet_address` (154). **SURFACED (§5.1)** — top priority. Schema untouched.                                                                                                                            |
| 4A#10 | PII encryption asymmetry                         | **NEW**                               | `src/payouts/creator-payout-preference.service.ts:58,60,72,74`                              | JSON fields (`direct_deposit_details`, `wire_details`, `mailing_address`) are AES-256-GCM encrypted before store; **`etransfer_email` and `crypto_wallet_address` are stored PLAINTEXT**. Feeds §5.1 decision. Not altered.                                                                       |
| 4A#10 | Sole ledger writer / append-only                 | **CONFIRMED**                         | `src/ledger/ledger.service.ts:44-66` (hash-chained `appendEntry`, no update/delete)         | Ledger-mutation grep on `prisma/`+`src/` returned empty (invariant holds).                                                                                                                                                                                                                        |
| 4A#10 | token-not-PAN                                    | **CONFIRMED**                         | `prisma/schema.prisma:31-42`; `PCI_SCOPE_MINIMIZATION.md:139-155`                           | `PaymentMethodToken` stores `providerToken`/`tokenFingerprint`, never raw PAN.                                                                                                                                                                                                                    |
| 4A#10 | Zero consumer/identity surface                   | **CONFIRMED**                         | `README.md:1-6`                                                                             | Finance-only bounded context; no accounts UI.                                                                                                                                                                                                                                                     |
| —     | `services/stripe/StripeService.ts` orphan        | **CONFIRMED dead-but-doc-referenced** | `services/stripe/StripeService.ts`; `README.md:31`; `docs/standards/MIGRATION_CHECKLIST.md` | Out of build/lint/test perimeter, but two migration docs still point at it as an audit item. Removal is **gated** (would need doc edits presupposing a decision) → §5.11. Not removed.                                                                                                            |

---

## 3. Applied safe-fixes (§4B)

| Fix                             | File                      | Commit    |
| ------------------------------- | ------------------------- | --------- |
| Added `engines.node` = `">=20"` | `package.json` (+3 lines) | `385d9ad` |

- **Only** change in the pushed diff. No source, schema, workflow, or lockfile touched.
- An unintended transitive `qs` bump that appeared in `yarn.lock` during dependency install was **reverted** before commit — it was not part of the confirmed subset and the lockfile is gated.

Nothing else on the §4B allowlist was actionable: eslint pin is valid (no correction), no confirmed-dead phantom imports exist, no stale branches remain to prune, and the advisory fixes all rewrite the gated lockfile (surfaced instead).

---

## 4. Surfaced decisions (§5) — Kevin's calls, not applied

1. **[TOP PRIORITY] Payout-destination PII / PCI scope.** `CreatorPayoutPreference` (`prisma/schema.prisma:147-161`) stores re-identifying payout destinations: `etransfer_email`, `crypto_wallet_address`, `mailing_address`, plus `direct_deposit_details`/`wire_details`. Decision needed against `PCI_SCOPE_MINIMIZATION.md`: **in-scope for Finance** (needed to disburse) **vs. tokenize/reference from AccountsZone** (keep the firewall's anonymous end truly anonymous). Note the PCI doc's encrypted-fields list (`PCI_SCOPE_MINIMIZATION.md:215-217`) covers only `PaymentMethodToken` — it is **silent on these payout fields**, so scope doctrine has a gap here.
   - **Sub-finding (new):** `etransfer_email` and `crypto_wallet_address` are stored **in plaintext**, while the JSON payout blobs are encrypted (`creator-payout-preference.service.ts:58,60,72,74`). If these fields stay in-scope, the asymmetry is worth closing; either way it's a schema/doctrine change for you, not a hygiene fix.
2. **Identity-resolution / firewall weakening.** None found — reported as clean. No action requested; flagged so the negative result is on record.
3. **Prisma 5 → 6 alignment.** Repo on `^5.22.0` (internally aligned); program standard is 6 (AccountsZone on 6.7). Gated, ledger-sensitive major — timing is an architect/program call.
4. **eslint `^10` correction target.** Not needed — `10.4.0` resolves to a real published version.
5. **`engines` value.** Applied `>=20` (program D7; lowest Node in CI). Alternative `>=22` to match AccountsZone — say the word and I'll switch it.
6. **Ledger schema / migration need.** None applied; there is no `prisma/migrations/` dir (schema-push posture). Any migration is money-sensitive + doctrine-gated.
7. **Workflow / invariants governance.** `financial-invariants-check.yml` intact and load-bearing — not modified.
8. **Stale merged-branch prune list.** Empty — the remote already holds only `main` + this branch. Docs that still list stale branches (`README.md:30`, `docs/standards/BRANCH_HYGIENE.md`) are dated snapshots; refreshing them is optional doc-hygiene (left untouched to avoid rewriting historical audit records).
9. **Dual lockfile.** Both `package-lock.json` (used by CI `npm ci`) and `yarn.lock` are committed. The `yarn.lock` appears vestigial. Removing it is reversible but touches lockfile territory (gated) — recommend a decision rather than an autonomous delete.
10. **Advisories (`npm audit`).** 5 total: `@babel/core` (moderate, dev-transitive), `js-yaml` (moderate, dev-transitive) — both fixable non-breaking; `multer` ×2 (high, transitive via `@nestjs/platform-express`) whose only offered fix **downgrades `@nestjs/core` to 7.5.5 (breaking major)** — do not `audit fix --force`. Even the two non-breaking fixes rewrite the gated `package-lock.json`. Approve and I'll apply the babel/js-yaml patch bumps in an isolated commit; the multer high is really an upstream NestJS bump to track.
11. **`services/stripe/` orphan.** Dead from a tooling view but still referenced as an audit item in `README.md:31` and `docs/standards/MIGRATION_CHECKLIST.md`. Decide: (a) wire a real Stripe integration under lint/test, or (b) delete the dir and strike both doc references in one change.
12. **Optional validation PR.** A `claude/*` push triggers no CI here and there's no auto-merge workflow, so a validation-only PR would run CI (ci, super-linter, ship-gate, financial-invariants) safely at CodeQL cost. Default stays push-only; open one on request if you want CI-green confirmation.

---

## 5. Verification (local — no branch CI)

Dependencies were installed offline (`npm ci --offline --ignore-scripts`, all 481 lockfile entries served from a primed cache) after transient registry/CDN `ECONNRESET`s; the Prisma schema-engine binary was fetched with a resumable `curl -C -` and Prisma Client generated locally. The `engines` change is metadata-only and cannot affect the gate, so before == after.

| Gate       | Command                                         | Before                    | After (with fix)          |
| ---------- | ----------------------------------------------- | ------------------------- | ------------------------- |
| Lint       | `eslint {src,test}/**/*.ts`                     | ✅ exit 0                 | ✅ exit 0                 |
| Type-check | `tsc --noEmit`                                  | ✅ exit 0                 | ✅ exit 0                 |
| Tests      | `jest`                                          | ✅ 184 passed / 23 suites | ✅ 184 passed / 23 suites |
| Build      | `tsc -p tsconfig.build.json`                    | ✅ `dist/main.js`         | ✅ `dist/main.js`         |
| Ship-gate  | `ts-node PROGRAM_CONTROL/ship-gate-verifier.ts` | ✅ passed (exit 0)        | ✅ passed (exit 0)        |

Ship-gate reports "human review required: yes" only because, with no base SHA locally, it scans all tracked files (which include `src/ledger/**` and `prisma/**`). The **actual pushed diff touches neither** — it is `package.json` only.

No secret, `.env`, financial PII, card data, or build artifact was staged. Diff = the confirmed §4B subset only.

---

## 6. Applied — round 2 (Kevin-approved §5 carry-back)

Kevin approved three surfaced §5 items for action on the same `claude/hygiene-audit-8sj5lp` branch. Applied under the same guardrails (single writer, push-only, local-green verify). The held/leave-as-is items are unchanged.

### Commits

| #   | Commit    | Subject                                                                 | Change                                                                                                                                                                                                                                                                                     |
| --- | --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `ff988cf` | drop vestigial yarn.lock; remove dead services/stripe orphan + doc refs | Deleted `yarn.lock` (npm is the declared toolchain; CI uses `npm ci`). Deleted `services/stripe/StripeService.ts` (orphaned USD sim stub, outside the build/lint/test perimeter) and struck its two migration-checklist references (`README.md`, `docs/standards/MIGRATION_CHECKLIST.md`). |
| 2   | `344771a` | patch @babel/core + js-yaml advisories (non-major)                      | `npm audit fix` (no `--force`): `@babel/*` 7.29.0→7.29.7, `js-yaml` 3.14.2→3.15.0. Incidental in-range patches: `@nestjs/core`/`platform-express` 11.1.19→11.1.27 (satisfy existing `^11.1.19`), plus browserslist/caniuse data. No `package.json` change, no majors.                      |

### Decisions honored

| §5 item                | Ruling                             | Action                                                                                                                                           |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| #9 Dual lockfile       | Approved delete                    | `yarn.lock` removed (commit 1).                                                                                                                  |
| #11 Stripe orphan      | Approved option (b)                | File + two doc refs removed (commit 1).                                                                                                          |
| #10 Advisories         | Approved 2 non-breaking only       | `@babel/core`, `js-yaml` patched (commit 2). `multer` ×2 highs **not** touched — deferred (breaking `@nestjs/core` downgrade); tracked upstream. |
| #1 Payout PII          | **HELD** — doctrine ruling pending | Schema and `creator-payout-preference.service.ts` **untouched**.                                                                                 |
| #3 Prisma 5→6          | Leave (gated major)                | No change.                                                                                                                                       |
| #5 `engines >=20`      | Leave (keep)                       | No change.                                                                                                                                       |
| #7 Invariants workflow | Leave (untouched)                  | No change.                                                                                                                                       |
| #8 Stale-branch prune  | None to prune                      | No change.                                                                                                                                       |

### Advisory status after round 2

`npm audit`: **5 → 3** vulnerabilities. The remaining 3 are the deferred `multer` highs only.

### Note — remaining `services/stripe` references (informational, not edited)

Deleting the file left descriptive mentions in analytical docs that were **out of the approved scope** (Kevin named only the two checklist refs): `docs/payments-and-payouts-review.md:61,192` (a P1 risk-review entry) and `TECH_DEBT_AND_COVERAGE_REPORT.md` (a dated snapshot). Editing a risk assessment is substantive, not hygiene — flagged for a separate decision rather than altered here.

### Verification — round 2 (local, all green after each commit)

| Gate                                 | After commit 1     | After commit 2     |
| ------------------------------------ | ------------------ | ------------------ |
| Lint (`eslint`)                      | ✅ exit 0          | ✅ exit 0          |
| Type-check (`tsc --noEmit`)          | ✅ exit 0          | ✅ exit 0          |
| Tests (`jest`)                       | ✅ 184 / 23 suites | ✅ 184 / 23 suites |
| Build (`tsc -p tsconfig.build.json`) | ✅ `dist/main.js`  | ✅ `dist/main.js`  |
| Ship-gate                            | ✅ passed (exit 0) | ✅ passed (exit 0) |

Neither the ledger schema, the `financial-invariants-check.yml` workflow, nor the opaque-token firewall was touched.

=== HYGIENE RUN COMPLETE ===
