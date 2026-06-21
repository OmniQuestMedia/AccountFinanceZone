# Error Contract — AccountFinanceZone

> Version: 1.0 · Rule applied: `GOVERNANCE-EQ-v1`
> Canonical source: [`../src/common/integration-error.ts`](../src/common/integration-error.ts)
> Companion: [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md)

AccountFinanceZone exposes a **stable, machine-readable error contract** so
consumer zones can branch programmatically and retry safely. Consumers MUST
branch on `error.code` (never on free-text `message`) and MUST honour the
`retryable` flag.

---

## Error envelope

Every contract error serializes to the same shape (`IntegrationError.toJSON()`):

```json
{
  "error": {
    "code": "AMOUNT_BELOW_MINIMUM",
    "message": "Minimum payout amount is $50 CAD",
    "httpStatus": 400,
    "retryable": false,
    "details": { "minimumCents": 5000, "providedCents": 1200 },
    "correlationId": "preq_…"
  }
}
```

| Field           | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `code`          | Stable enum value — the only field you should branch on.               |
| `message`       | Human-readable; may change between releases. Do not parse.             |
| `httpStatus`    | HTTP status returned at the API boundary.                              |
| `retryable`     | `true` only for transient conditions safe to blindly retry.            |
| `details`       | Optional structured context (field names, limits). Forward-compatible. |
| `correlationId` | Echoed upstream/request id for cross-zone tracing, when available.     |

---

## Code reference

| Code                          | HTTP | Retryable | Raised when                                                                     |
| ----------------------------- | ---- | --------- | ------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`           | 400  | no        | Generic request validation failure.                                             |
| `INVALID_EVENT_PAYLOAD`       | 400  | no        | Inbound cross-zone event is not an object or omits required fields.             |
| `UNSUPPORTED_PAYOUT_METHOD`   | 400  | no        | Payout method outside the documented enum.                                      |
| `AMOUNT_BELOW_MINIMUM`        | 400  | no        | Payout below the $50 CAD floor.                                                 |
| `CREATOR_CONTEXT_REQUIRED`    | 401  | no        | `x-creator-id` header missing on a creator-scoped endpoint.                     |
| `RESOURCE_NOT_FOUND`          | 404  | no        | Resource missing or not owned by the caller.                                    |
| `DUPLICATE_REQUEST`           | 409  | no        | Idempotency key already processed / active request in flight.                   |
| `CONFLICTING_STATE`           | 409  | no        | Forward-only state transition violated (e.g. settle an already-settled payout). |
| `COMPLIANCE_BLOCKED`          | 422  | no        | Compliance gate rejected the movement (e.g. non-CA residency).                  |
| `FRAUD_BLOCKED`               | 422  | no        | Fraud assessment returned `BLOCK`.                                              |
| `CASH_REFUND_PROHIBITED`      | 422  | no        | Cash refund attempted (Canonical Corpus v11 — use promotional credits).         |
| `INSUFFICIENT_WALLET_BALANCE` | 422  | no        | Debit exceeds available wallet buckets.                                         |
| `DOWNSTREAM_UNAVAILABLE`      | 503  | **yes**   | Transient dependency failure; safe to retry with backoff.                       |

---

## Retry semantics

- **`retryable: false`** — the request will keep failing until the input or
  state changes. Do not retry unchanged; surface to the caller / dead-letter.
- **`retryable: true`** — transient. Retry with exponential backoff and jitter.
  Always carry the same idempotency key so retries cannot double-apply.

---

## Mapping to consumer behaviour

| Situation                        | Code                     | Consumer action                                        |
| -------------------------------- | ------------------------ | ------------------------------------------------------ |
| Malformed event published to AFZ | `INVALID_EVENT_PAYLOAD`  | Fix payload schema; alert producer. Never retry as-is. |
| Cross-border movement            | `COMPLIANCE_BLOCKED`     | Stop the flow; route to compliance review.             |
| Risky transaction                | `FRAUD_BLOCKED`          | Stop; expect a `FraudFlagRaised` event for audit.      |
| Duplicate submit                 | `DUPLICATE_REQUEST`      | Treat as success of the original; reconcile by id.     |
| Transient outage                 | `DOWNSTREAM_UNAVAILABLE` | Backoff + retry with the same idempotency key.         |

> Contract behaviour is pinned by
> [`../test/integration/accountszone-billing.spec.ts`](../test/integration/accountszone-billing.spec.ts)
> and [`../test/integration/compliance-residency-gate.spec.ts`](../test/integration/compliance-residency-gate.spec.ts).
