# Integration Contract - AccountFinanceZone

> Version: 1.0
> Rule applied: `GOVERNANCE-EQ-v1`
> All financial writes are append-only. Corrections use OFFSET/reversal entries — never UPDATE or DELETE on financial data rows. Status and lifecycle fields advance forward-only via monotonic state transitions.

---

## Payout Method Enum

```text
PayoutMethod (maps to DB enum: payout_method)
  DIRECT_DEPOSIT       - Canadian bank direct deposit
  E_TRANSFER           - Interac e-Transfer
  WIRE_TRANSFER        - International wire transfer
  CHECK_BY_MAIL        - Physical cheque mailed to address
  CRYPTO_NOWPAYMENTS   - Crypto via NOWPayments API
```

---

## Payout Rails Endpoints

### POST /payouts/preference

Set or update a creator's payout preference. Sensitive fields are AES-256-GCM encrypted at rest using `ENCRYPTION_MASTER_KEY`.

Headers:

```text
x-creator-id: <uuid>   (required)
Content-Type: application/json
```

Request body:

```json
{
  "preferredMethod": "E_TRANSFER",
  "etransferEmail": "creator@example.com"
}
```

Response 200:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "creator_id": "a1b2c3d4-...",
  "preferred_method": "E_TRANSFER",
  "etransfer_email": "creator@example.com",
  "direct_deposit_details": null,
  "wire_details": null,
  "crypto_wallet_address": null,
  "mailing_address": null,
  "correlation_id": "cppref_...",
  "created_at": "2026-05-31T00:00:00.000Z",
  "updated_at": "2026-05-31T00:00:00.000Z"
}
```

---

### GET /payouts/preference

Retrieve the authenticated creator's current payout preference. Encrypted fields are decrypted on read.

Headers:

```text
x-creator-id: <uuid>   (required)
```

Response 200 - same shape as POST /payouts/preference response above.

Response 404 - if no preference has been set.

---

### POST /payouts/request

Submit a payout request. Validates minimum threshold ($50 CAD), no active holds.

Headers:

```text
x-creator-id: <uuid>   (required)
Content-Type: application/json
```

Request body:

```json
{
  "amountCents": 7500,
  "method": "E_TRANSFER"
}
```

Response 201:

```json
{
  "id": "b2c3d4e5-...",
  "creator_id": "a1b2c3d4-...",
  "amount_cents": 7500,
  "currency": "CAD",
  "method": "E_TRANSFER",
  "status": "PENDING",
  "rule_applied_id": "GOVERNANCE-EQ-v1",
  "correlation_id": "preq_...",
  "created_at": "2026-05-31T00:00:00.000Z"
}
```

Response 400 - amount below $50, or existing active request in flight.

---

### GET /payouts/requests

List all payout requests for the authenticated creator, newest first.

Headers: `x-creator-id: <uuid>` (required)

Response 200:

```json
[
  {
    "id": "b2c3d4e5-...",
    "amount_cents": 7500,
    "method": "E_TRANSFER",
    "status": "PENDING",
    "created_at": "2026-05-31T00:00:00.000Z"
  }
]
```

---

### GET /payouts/requests/:id

Get status and settlement details for a single payout request.

Headers: `x-creator-id: <uuid>` (required)

Response 200:

```json
{
  "id": "b2c3d4e5-...",
  "amount_cents": 7500,
  "method": "E_TRANSFER",
  "status": "PENDING",
  "settlements": []
}
```

Response 404 - request not found or not owned by this creator.

---

## Theatre / Linger Endpoints

### POST /theatre/shows

Headers:

```text
x-creator-id: <uuid>   (required - set by API gateway)
Content-Type: application/json
```

Request body:

```json
{ "ticketPriceCents": 500 }
```

Response 201:

```json
{
  "id": "c3d4e5f6-...",
  "creator_id": "a1b2c3d4-...",
  "ticket_price_cents": 500,
  "block_start_at": "2026-05-31T20:00:00.000Z",
  "status": "ACTIVE"
}
```

---

### POST /theatre/shows/:id/linger

Request body:

```json
{
  "guestId": "d4e5f6a7-...",
  "creatorId": "a1b2c3d4-...",
  "viewerSeconds": 120
}
```

Response 201 - LingerEvent record. Response 400 - show not ACTIVE.

---

### POST /theatre/shows/:id/settle

Algorithm: `creator_pool = floor(ticket_price * tickets * 0.70)`,
`creator_share = floor(pool * creator_seconds / total_seconds)`

Response 200:

```json
{
  "showId": "c3d4e5f6-...",
  "payouts": { "a1b2c3d4-...": 245 },
  "ledgerEntries": [
    { "creatorId": "a1b2c3d4-...", "amountCents": 245, "entryId": "le_..." }
  ]
}
```

---

### GET /theatre/shows/:id/payout-preview

Read-only preview. Same payout calculation, no state mutation.

Response 200:

```json
{
  "showId": "c3d4e5f6-...",
  "payouts": { "a1b2c3d4-...": 245 }
}
```

---

## Events Published

### payout.requested

```json
{
  "type": "payout.requested",
  "aggregateId": "<payoutRequestId>",
  "payload": {
    "payoutRequestId": "...",
    "creatorId": "...",
    "amountCents": 7500,
    "method": "E_TRANSFER"
  },
  "emittedAt": "2026-05-31T00:00:00.000Z"
}
```

### payout.settled

```json
{
  "type": "payout.settled",
  "aggregateId": "<payoutRequestId>",
  "payload": {
    "payoutRequestId": "...",
    "settlementId": "...",
    "method": "CRYPTO_NOWPAYMENTS",
    "settledAt": "..."
  },
  "emittedAt": "2026-05-31T00:05:00.000Z"
}
```

### theatre.block.settled

```json
{
  "type": "theatre.block.settled",
  "aggregateId": "<showId>",
  "payload": { "showId": "...", "payouts": { "a1b2c3d4-...": 245 } },
  "emittedAt": "2026-05-31T21:00:00.000Z"
}
```

---

## Append-Only Invariant

| Table                | Notes                                                             |
| -------------------- | ----------------------------------------------------------------- |
| `ledger_entries`     | CREDIT/DEBIT/OFFSET only. Corrections = new OFFSET row.           |
| `transactions`       | Payment, refund, chargeback, payout flows.                        |
| `payouts`            | Legacy payout records with revenue share BPS.                     |
| `payout_requests`    | Status moves forward only: PENDING -> APPROVED -> SETTLED/FAILED. |
| `payout_settlements` | One record per processing attempt.                                |
| `theatre_shows`      | `block_end_at` and `status=SETTLED` written exactly once.         |
| `theatre_tickets`    | One row per fan ticket purchase.                                  |
| `linger_events`      | One row per viewer-seconds batch.                                 |
| `fraud_assessments`  | Risk scores and decisions.                                        |
| `audit_trail`        | Immutable event log.                                              |

`creator_payout_preferences` is the only mutable table.

---

## KMS Encryption

| Model                     | Field                    | Encrypted                                   |
| ------------------------- | ------------------------ | ------------------------------------------- |
| `CreatorPayoutPreference` | `direct_deposit_details` | Yes - AES-256-GCM via ENCRYPTION_MASTER_KEY |
| `CreatorPayoutPreference` | `wire_details`           | Yes - AES-256-GCM via ENCRYPTION_MASTER_KEY |
| `CreatorPayoutPreference` | `mailing_address`        | Yes - AES-256-GCM via ENCRYPTION_MASTER_KEY |
| `CreatorPayoutPreference` | `etransfer_email`        | No - low sensitivity                        |
| `CreatorPayoutPreference` | `crypto_wallet_address`  | No - public address                         |

Stored as `{ "encrypted": "<iv:authTag:ciphertext>" }` in the Json column.
Decrypted in `CreatorPayoutPreferenceService.getByCreatorId()` before returning to caller.
Sensitive fields are always decrypted server-side and returned only to the authenticated creator via the x-creator-id header gated endpoint.
