# Architecture — AccountFinanceZone

> Version: 1.0 · Rule applied: `GOVERNANCE-EQ-v1`
> Focused on **integration architecture and readiness**. For invariants see
> [`standards/CANONICAL_CORPUS_v11_INVARIANTS.md`](./standards/CANONICAL_CORPUS_v11_INVARIANTS.md);
> for the consumer contract see [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md).

AccountFinanceZone (AFZ) is the **finance-only bounded context** and the **sole
ledger writer** in the OmniQuest Media Inc. DFSP stack. It is deliberately
separated from AccountsZone (identity/profile) so that all money movement passes
through one auditable, append-only control path.

---

## 1. System context

```text
            AccountsZone                         (upstream identity)
        (tier change, account linking)
                    │  events
                    ▼
        ┌───────────────────────────────┐
        │       AccountFinanceZone       │  ── sole ledger writer ──
        │                                │
   gateway   transactions · billing · payouts · theatre
   x-creator-id   │        │         │        │
        │         └────────┴────┬────┴────────┘
        │                       │
        │              compliance gate (CA residency)
        │              fraud gate (risk scoring)
        │                       │
        │               append-only ledger
        │                       │ events (v1.1 envelope, at-least-once)
        ▼                       ▼
   creator apps      eCommsZone bridge ──► Rewards · Marketplace · OKIB · Compliance
```

Every money movement is ordered: **idempotency check → compliance gate → fraud
gate → ledger append → event publish**. An event is only emitted after the
ledger write it describes has succeeded.

---

## 2. Module map

| Module          | Responsibility                               | Integration role                                            |
| --------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `transactions/` | payments, chargebacks, VIP promo credits     | inbound HTTP/service entry; emits payment/chargeback events |
| `billing/`      | revenue-share, tier rules, account linking   | **consumes** AccountsZone events (validated)                |
| `payouts/`      | payout requests, settlements, reconciliation | inbound HTTP (`x-creator-id`); emits payout events          |
| `theatre/`      | show blocks, linger settlement               | emits `theatre.block.settled`                               |
| `ledger/`       | append-only ledger                           | source of truth; **no update/delete**                       |
| `compliance/`   | residency + policy gate (OmniComplianceZone) | gates all movement                                          |
| `fraud/`        | risk scoring                                 | gates all movement                                          |
| `wallet/`       | three-bucket spend ordering                  | promotional → rewards → cash                                |
| `events/`       | event envelope + webhook delivery            | **outbound integration plane**                              |
| `common/`       | shared types + `IntegrationError`            | error contract                                              |

---

## 3. Event delivery architecture

- **Producers** call `EventPublisher.publish()`. There is exactly one publish
  path; no module talks to the webhook client directly except through it.
- **Central enrichment** (`enrichFinanceEvent`) stamps `eventId`, `eventVersion`
  and `source` on every event, so identity/versioning is uniform regardless of
  producer — consumers always get a dedupe key.
- **Transport** is the v1.1 webhook envelope to `ECOMMSZONE_WEBHOOK_URL`,
  optionally HMAC-signed. eCommsZone is the fan-out bridge to other zones.
- **Best-effort, non-blocking**: delivery is timeboxed (3s) and never blocks the
  financial control path. Delivery is **at-least-once** → consumers dedupe on
  `eventId`.

```text
producer service ─► EventPublisher.publish ─► enrichFinanceEvent ─► ECommsZoneClient
                                                                   │ POST v1.1 envelope
                                                                   ▼
                                                              eCommsZone ─► consumer zones
```

---

## 4. Integration readiness scorecard

| Capability                      | Status        | Evidence                                                                                     |
| ------------------------------- | ------------- | -------------------------------------------------------------------------------------------- |
| Documented HTTP surface         | ✅            | [`API_SURFACE.md`](./API_SURFACE.md), [`INTEGRATION_CONTRACT.md`](./INTEGRATION_CONTRACT.md) |
| Consumer-oriented guide         | ✅            | [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md)                                             |
| Stable event identity (dedupe)  | ✅            | `eventId` + `x-oqmi-event-id` header                                                         |
| Event versioning                | ✅            | `eventVersion` (1.1), forward-compatible policy                                              |
| Machine-readable error contract | ✅            | [`ERROR_CONTRACT.md`](./ERROR_CONTRACT.md), `IntegrationError`                               |
| Validated inbound events        | ✅            | `BillingService` rejects malformed payloads                                                  |
| Signed delivery                 | ✅ (optional) | HMAC-SHA256 when secret configured                                                           |
| Consumer-simulation tests       | ✅            | [`../test/integration/`](../test/integration/)                                               |
| Append-only ledger guarantees   | ✅            | Canonical Corpus v11 invariants                                                              |
| Idempotent money movement       | ✅            | idempotency key on debit paths                                                               |

---

## 5. Boundaries & non-goals

- AFZ never stores raw PAN/CVV — only vault token references (PCI scope
  minimisation, see [`../PCI_SCOPE_MINIMIZATION.md`](../PCI_SCOPE_MINIMIZATION.md)).
- AFZ does not issue cash refunds. VIP refunds become promotional credits.
- AI is advisory-only and can never mutate the ledger.
- Direct Cyrano delivery is not permitted; cross-repo delivery uses the v1.1
  webhook contract only.
- Data residency is `ca-central-1` only.
