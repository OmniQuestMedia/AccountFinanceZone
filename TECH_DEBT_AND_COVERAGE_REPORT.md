# Tech Debt & Coverage Report — AccountFinanceZone

**Date:** 2026-06-20
**Scope:** Code health, test coverage, and technical-debt reduction sweep.
**Rule applied:** GOVERNANCE-EQ-v1

---

## 1. Audit: duplicate, outdated, or broken scaffolding

| Finding | Severity | Status |
| --- | --- | --- |
| `VALID_PAYOUT_METHODS` set duplicated in `payout-request.service.ts` and `creator-payout-preference.service.ts` | Medium — two validation paths could silently drift | **Fixed** — consolidated into `src/payouts/payout-methods.ts` |
| `services/stripe/StripeService.ts` is orphaned scaffolding (USD stub with `TODO`, not imported by any `src` module, and outside the `tsconfig`/`eslint`/`jest` globs) | Medium — dead code rotting outside the build perimeter | **Flagged, not removed** — see note below |
| `RULE_APPLIED_ID = 'GOVERNANCE-EQ-v1'` literal repeated across ~7 files | Low — governance constant duplicated | **Noted** — left in place (intentionally co-located per governance convention); candidate for a shared `governance.ts` constant later |
| `BRANCH_HYGIENE.md` stale-branch list dated 2026-06-18 was out of date (12 of 15 listed branches already deleted) | Low — misleading hygiene record | **Fixed** — refreshed with live remote state |

### Note on `services/stripe/StripeService.ts`

This module is genuinely dead from a tooling perspective: it is not referenced by
any file under `src/`, and `tsconfig.build.json` (`src/**`), `eslint`
(`{src,test}/**`), and `jest` (`src/**`) all exclude it, so it is never compiled,
linted, or tested. However, it is **still referenced as a pending audit item** in
two migration documents:

- `README.md` → "Audit `services/stripe/` for deprecated API versions or hardcoded keys"
- `docs/standards/MIGRATION_CHECKLIST.md` → same checklist item

Because a documented migration audit still points at this directory and the file
was not authored in this sweep, it was **not deleted**. Recommended follow-up
(requires an owner decision): either (a) wire a real Stripe integration into the
NestJS module graph and bring it under lint/test, or (b) remove the directory and
strike the two migration-checklist references in the same change.

---

## 2. Test coverage improvements

Focus was the financial-critical paths: ledger, payouts/settlement, escrow
(theatre block payouts), and the event egress client.

### Before → After (whole repo)

| Metric | Before | After |
| --- | --- | --- |
| Statements | 75.49% | **84.29%** |
| Branches | 81.50% | **86.70%** |
| Functions | 81.48% | **95.41%** |
| Lines | 77.26% | **86.55%** |
| Tests | 141 | **163** (+22) |
| Suites | 16 | **18** (+2) |

### Newly covered, previously weak areas

- **`payouts.controller.ts`**: 0% → **100%** (new `test/payouts.controller.spec.ts`) — header guard, all 5 endpoints.
- **`theatre.controller.ts`**: 0% → **100%** (new `test/theatre.controller.spec.ts`) — escrow endpoints, guard, payout-preview Map→object serialization.
- **`payout-request.service.ts`**: 83% → **100%** — added `listByCreator`, `getById` (found + `NotFoundException`) cases (functions 50% → 100%).
- **`payout-settlement.service.ts`**: 91% → **100%** — added crypto-without-API-key manual-fallback path.
- **`theatre-payout.service.ts`**: 88% → **93%** — added compliance-rejection path asserting the show is marked `FAILED` (never wedged in `SETTLING`) and no ledger/event side effects occur.
- **`ecomms-zone.client.ts`**: 84% → **96%** (branches 40% → 80%) — added no-shared-secret, non-2xx-warn, and fetch-throw (delivery-failure-isolation) paths.
- **`creator-payout-preference.service.ts`**: 82% → **97%** — added encrypted-field decryption on read and non-envelope pass-through.

---

## 3. Dead / redundant code cleanup

- Removed two copies of the payout-method allow-list; both services now import
  `isValidPayoutMethod` / `VALID_PAYOUT_METHODS` from a single typed source of
  truth (`src/payouts/payout-methods.ts`). The shared module also adds a
  `PayoutMethod` union type so the allow-list and the type cannot diverge.
- No unreachable branches or unused exports were found within the `src/` build
  perimeter beyond the orphaned `services/stripe` directory documented above.

---

## 4. Branch hygiene

Live remote audit (`git for-each-ref` + merged/unmerged check against
`origin/main`) on 2026-06-20:

| Branch | Last commit | Merged into main? | Recommendation |
| --- | --- | --- | --- |
| `claude/jolly-turing-thakuh` | 2026-06-20 | Yes (PR #25) | Safe to delete |
| `copilot/run-hygiene-audit` | 2026-06-04 | Yes | Safe to delete |
| `claude/cleanup-prompts` | 2026-05-26 | No | Stale (~25d) — review then delete |
| `claude/ci-fix-yarn-install-errors` | 2026-05-24 | No | Stale (~27d) — review then delete |
| `claude/restore-full-codebase` | 2026-06-20 | No | Recent — keep for now |
| `ledger-hardening` | 2026-06-19 | No | Superseded by merged ledger-hardening commit on main; verify then delete |

The prior `BRANCH_HYGIENE.md` list (15 branches) was stale — 12 of those have
already been deleted from the remote. The doc has been refreshed to match.

> Branch deletion is a destructive, outward-facing action and was **not**
> performed automatically. The table above is the recommendation set for an
> owner to action via the GitHub UI or `git push origin --delete <branch>`.

---

## 5. Quality gates — all green

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | ✅ exit 0 |
| Type-check / build | `npm run build` | ✅ exit 0 |
| Tests | `npx jest` | ✅ 163 passed / 18 suites |

---

## 6. Recommended follow-ups (not done in this sweep)

1. Decide the fate of `services/stripe/` (wire-in vs. remove) and reconcile the
   two migration-checklist references.
2. Optionally centralize `RULE_APPLIED_ID` into a shared governance constant.
3. Add a coverage threshold gate to `jest.config.ts` (e.g. 80% lines/branches)
   so coverage cannot silently regress.
4. Action the stale-branch deletions listed in §4.
