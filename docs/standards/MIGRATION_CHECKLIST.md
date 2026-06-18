# AccountFinanceZone — Migration Readiness Checklist

> Window: FullHost server migration (24-72h). Complete all items before cutover.

## Status Legend

- `[x]` Complete
- `[ ]` Pending
- `[!]` Blocked / Needs Action

---

## STEP 1: Branch & Repo Hygiene

- [x] `migration-prep` branch created from main
- [!] **MANUAL REQUIRED:** Enable branch protection on `main` (require PRs, no direct push, require CI green)
      — GitHub Admin token needed, cannot be automated via this session
- [!] **MANUAL REQUIRED:** Delete/archive stale branches (15 stale branches identified).
      Branches to archive:
  - `agent/cowork-orch-2026-05-19-droid-rollout`
  - `claude/add-copilot-instructions-file`
  - `claude/add-revenue-share-ledger`
  - `claude/ci-fix-yarn-install-errors`
  - `claude/cleanup-mission-linter-code-quality`
  - `claude/cleanup-prompts`
  - `claude/copilot-review-fixes`
  - `claude/final-homestretch-cleanup`
  - `claude/hygiene-fixes`
  - `claude/peaceful-hypatia-jz3Md`
  - `claude/phase-4-4-security-testing-finalization`
  - `claude/restore-full-codebase`
  - `copilot/cleanup-governance-sync`
  - `copilot/run-hygiene-audit`
  - `feature/playbooks-reference-v1`

## STEP 2: File & System Audit

- [x] `.gitignore` expanded: secrets, env, processor keys, test financial data
- [x] `docs/standards/` directory created with Canonical Corpus invariants
- [x] `docs/standards/CANONICAL_CORPUS_v11_INVARIANTS.md` added
- [ ] Verify no test financial seed data files committed in repo history
- [ ] Confirm `archive/` folder contents are intentional (not deprecated scripts)
- [ ] Confirm `LINT_CLEANUP_SUMMARY.md` at root can be moved to docs/ or deleted

## STEP 3: Dependency & Hook Check

- [x] `package.json` reviewed — NestJS + Prisma, no deprecated payment SDKs in root
- [ ] Audit `services/stripe/` for hardcoded keys or deprecated API versions
- [ ] Verify all balance mutations in `src/ledger/` use INSERT-only pattern
- [ ] Verify `src/billing/`, `src/payouts/`, `src/transactions/` use WalletService.debit() with bucket enforcement
- [ ] Verify chargeback package assembler in `src/fraud/` or `src/compliance/`
- [ ] Verify escrow hold matrix logic exists
- [ ] Confirm idempotency key check on all debit endpoints

## STEP 4: Compliance & Standards Alignment

- [x] Canonical Corpus v11 invariants documented in `docs/standards/`
- [x] CI stub added: `.github/workflows/financial-invariants-check.yml`
- [ ] AML threshold logic verified in `src/compliance/`
- [ ] FINTRAC structuring detection active
- [ ] PEP/OFAC screening wired up
- [ ] No-refund enforcement verified (no cash refund endpoints)
- [ ] VIP Refund Protocol: only promotional credit re-issue allowed
- [ ] Universal checkout confirmation gate active

## STEP 5: Migration Cutover Gates

- [ ] All CI checks green on `migration-prep` → `main` PR
- [ ] Financial invariants CI job green
- [ ] No secrets in repo (secret scanning clean)
- [ ] Database migration scripts reviewed for append-only compliance
- [ ] FullHost environment variables configured (from `.env.example`)
- [ ] Smoke test: end-to-end transaction with three-bucket debit order verified
- [ ] Smoke test: chargeback webhook received and assembler package created
- [ ] Smoke test: AML flag triggered on threshold transaction
- [ ] Rollback plan documented and reviewed

---

## References

- [Canonical Corpus v11 Invariants](./CANONICAL_CORPUS_v11_INVARIANTS.md)
- [API Surface](../API_SURFACE.md)
- [Integration Contract](../INTEGRATION_CONTRACT.md)
- OQMI_PROTOTYPE_STANDARDS v1.1
- OQMI_GOVERNANCE.md
- PCI_SCOPE_MINIMIZATION.md
