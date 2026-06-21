# Integration Guide — AccountFinanceZone

> Audience: engineers in **consumer zones** integrating with AccountFinanceZone
> (Rewards, Marketplace, OKIB, OmniComplianceZone, AccountsZone, eCommsZone).
> Version: 1.0 · Rule applied: `GOVERNANCE-EQ-v1`
> Companion specs: [`API_SURFACE.md`](./API_SURFACE.md) ·
> [`INTEGRATION_CONTRACT.md`](./INTEGRATION_CONTRACT.md) ·
> [`ERROR_CONTRACT.md`](./ERROR_CONTRACT.md) ·
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) ·
> [`../WEBHOOK_CONTRACTS.md`](../WEBHOOK_CONTRACTS.md)

AccountFinanceZone is the **sole ledger writer** for OmniQuest Media Inc. and the
finance-only bounded context. This guide is the fastest safe path for another
service to integrate with it.

---

## 1. The three integration planes

| Plane               | Direction       | Mechanism                                                       | Who uses it                                        |
| ------------------- | --------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| **Inbound HTTP**    | consumer → AFZ  | REST endpoints gated by `x-creator-id` (set by the API gateway) | creator-facing apps via gateway                    |
| **Inbound events**  | upstream → AFZ  | event handlers (`BillingService`)                               | AccountsZone                                       |
| **Outbound events** | AFZ → consumers | webhook v1.1 envelope (eCommsZone bridge / fan-out)             | Rewards, Marketplace, OKIB, Compliance, eCommsZone |

**Golden rules for every integration:**

1. AccountFinanceZone is the only system that writes the financial ledger. Never
   replicate ledger state — read it via events, treat it as the source of truth.
2. The ledger is **append-only**. There are no update/delete or cash-refund
   primitives. Corrections are offset entries; refunds are promotional credits.
3. All outbound events are **at-least-once**. Consumers MUST be idempotent on
   `eventId`.
4. All money movement is gated by **compliance** (Canadian residency) and
   **fraud** before it reaches the ledger. Expect hard rejections.

---

## 2. Consuming events (Rewards, Marketplace, OKIB, Compliance)

### 2.1 Envelope shape

Every event delivered over the webhook bridge is wrapped in the v1.1 transport
envelope (see [`../WEBHOOK_CONTRACTS.md`](../WEBHOOK_CONTRACTS.md)). The inner
`event` and the envelope both carry a stable `eventId`:

```json
{
  "contractVersion": "1.1",
  "destination": "eCommsZone",
  "source": "AccountFinanceZone",
  "ruleAppliedId": "GOVERNANCE-EQ-v1",
  "eventId": "evt_8f3c…",
  "event": {
    "type": "PayoutIssued",
    "aggregateId": "po_123",
    "eventId": "evt_8f3c…",
    "eventVersion": "1.1",
    "source": "AccountFinanceZone",
    "payload": {
      "creatorAccountId": "creator_1",
      "amountMinor": "5000",
      "revenueShareBps": 5000,
      "ledgerEntryId": "le_…"
    },
    "emittedAt": "2026-06-20T00:00:00.000Z"
  },
  "deliveredAt": "2026-06-20T00:00:00.000Z"
}
```

Delivery headers:

```text
content-type: application/json
x-oqmi-contract-version: 1.1
x-oqmi-rule-applied-id: GOVERNANCE-EQ-v1
x-oqmi-source-system: AccountFinanceZone
x-oqmi-event-id: evt_8f3c…           # use as your dedupe key
x-oqmi-signature-sha256: sha256=…    # present when a shared secret is configured
```

### 2.2 The consumer checklist

- [ ] **Verify the signature** when `x-oqmi-signature-sha256` is present:
      `HMAC-SHA256(sharedSecret, rawBody)`, compared in constant time.
- [ ] **Dedupe on `eventId`** (header `x-oqmi-event-id` or `event.eventId`).
      Persist processed ids; a redelivery of the same id MUST be a no-op.
- [ ] **Pin to `eventVersion`**. Treat unknown fields as forward-compatible
      additions — never hard-fail on them.
- [ ] **`amountMinor` is a string** carrying an integer count of minor units
      (cents). Parse with a big-integer type; never use floats for money.
- [ ] **Acknowledge fast, process async.** Forwarding is best-effort and
      timeboxed at 3s; do not block the response on heavy work.
- [ ] **Be tolerant of out-of-order delivery.** Order by `emittedAt` where it
      matters; never assume strict ordering.

### 2.3 Minimal idempotent consumer (reference)

```ts
const processed = new Set<string>(); // back this with a durable store

function handle(envelope) {
  const eventId = envelope.eventId; // or header x-oqmi-event-id
  if (processed.has(eventId)) return; // at-least-once dedupe
  processed.add(eventId);

  switch (envelope.event.type) {
    case 'PayoutIssued':
      awardLoyaltyPoints(envelope.event.payload);
      break;
    // … unknown types: ignore safely
  }
}
```

> A complete, tested reference consumer lives in
> [`../test/integration/rewards-consumer.spec.ts`](../test/integration/rewards-consumer.spec.ts).

### 2.4 Event catalog (per consumer)

| Event                     | Emitted when                                        | Primary consumers                | Key payload                                                           |
| ------------------------- | --------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `PaymentProcessed`        | payment cleared fraud + compliance and was appended | Marketplace, Rewards, Compliance | `accountId`, `amountMinor`, `currency`, `sourceEventId`               |
| `PayoutIssued`            | creator payout appended to ledger                   | Rewards, OKIB                    | `creatorAccountId`, `amountMinor`, `revenueShareBps`, `ledgerEntryId` |
| `PayoutSettled`           | payout settlement confirmed                         | Rewards, OKIB                    | `creatorAccountId`, `amountMinor`, `settledAt`                        |
| `PayoutFailed`            | payout processing failed                            | OKIB, ops                        | `creatorAccountId`, `reason`                                          |
| `ChargebackRegistered`    | bank chargeback appended as offset                  | Compliance, OKIB                 | `offsetOfEntryId`                                                     |
| `FraudFlagRaised`         | fraud risk blocked/flagged a movement               | Compliance                       | `fraud.riskScore`, `fraud.flags`, `fraud.decision`, `source`          |
| `PromotionalCreditIssued` | VIP refund re-issued as promo credit                | Rewards, Marketplace             | `accountId`, `amountMinor`, `bucket`, `reason`                        |
| `payout.requested`        | creator submits a payout request                    | OKIB                             | `payoutRequestId`, `creatorId`, `amountCents`, `method`               |
| `payout.settled`          | payout request settled                              | OKIB                             | `payoutRequestId`, `settlementId`, `method`, `settledAt`              |
| `theatre.block.settled`   | theatre show block settled                          | Rewards                          | `showId`, `payouts` (creatorId → amountCents)                         |

> **Naming note:** `PascalCase` types are domain lifecycle events;
> `dotted.case` types are request/workflow events scoped to the payout-request
> aggregate. Both share the same envelope. Match on the exact `type` string.

> `RefundInitiated` is **deprecated** (Canonical Corpus v11 — no cash refunds).
> Do not build new consumers against it; consume `PromotionalCreditIssued`.

---

## 3. Calling the HTTP API

All creator-scoped endpoints require the `x-creator-id` header, which the API
gateway derives from the authenticated session. Services behind the gateway must
never spoof this header.

```http
POST /payouts/request
x-creator-id: a1b2c3d4-…
content-type: application/json

{ "amountCents": 7500, "method": "E_TRANSFER" }
```

- Amounts are integer **cents** (`amountCents`) on the HTTP boundary and
  string **minor units** (`amountMinor`) on the event boundary.
- Minimum payout is **$50 CAD** (5000 cents). Below that → `400`.
- Only one active payout request per creator at a time → `400` while in flight.
- See [`API_SURFACE.md`](./API_SURFACE.md) for the full endpoint table and
  [`INTEGRATION_CONTRACT.md`](./INTEGRATION_CONTRACT.md) for request/response
  bodies and the payout-method enum.

---

## 4. Publishing events INTO AccountFinanceZone (AccountsZone)

AccountsZone is the only upstream producer today. Events are consumed by
`BillingService`:

| Event                         | Handler                           | Required fields                             |
| ----------------------------- | --------------------------------- | ------------------------------------------- |
| `SubscriptionPlanChangeEvent` | `consumeSubscriptionTierChange()` | `accountId`, `newTier`                      |
| `AccountLinkingEvent`         | `linkAccountToCreator()`          | `accountId`, `creatorAccountId`, `linkType` |

Inbound events are **validated on arrival**. A payload that is not an object, or
that omits a required field, is rejected with an `INVALID_EVENT_PAYLOAD`
[integration error](./ERROR_CONTRACT.md) (HTTP 400, non-retryable) — fix the
payload, do not retry unchanged.

---

## 5. Error handling

AccountFinanceZone returns a **stable, machine-readable error contract**. Branch
on `error.code`, never on free-text messages, and honour `error.retryable`.

```json
{
  "error": {
    "code": "COMPLIANCE_BLOCKED",
    "message": "Canadian data residency only",
    "httpStatus": 422,
    "retryable": false,
    "details": { "residencyRegion": "US" }
  }
}
```

Full code table, HTTP mapping and retry semantics:
[`ERROR_CONTRACT.md`](./ERROR_CONTRACT.md).

---

## 6. Versioning & compatibility

- **Event contract version** is `eventVersion` on each event (currently `1.1`).
  Additive optional fields do **not** bump it; consumers must ignore unknowns.
- **Transport contract version** is `contractVersion` / `x-oqmi-contract-version`
  on the envelope (currently `1.1`).
- Breaking changes ship a new major version and a deprecation window; deprecated
  events (e.g. `RefundInitiated`) are documented but never silently removed.

---

## 7. Local sandbox

```bash
npm install
cp .env.example .env          # ECOMMSZONE_WEBHOOK_URL points at your listener
npm test                      # includes test/integration/** consumer simulations
docker compose up --build
```

To receive events locally, set `ECOMMSZONE_WEBHOOK_URL` to your endpoint and
(optionally) `ECOMMSZONE_WEBHOOK_SECRET` to validate signatures. With no URL
configured, events are logged locally and not forwarded — safe for unit testing.
