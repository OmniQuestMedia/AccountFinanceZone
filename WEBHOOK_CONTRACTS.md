# WEBHOOK_CONTRACTS.md

## Version

- Contract version: `1.1`
- Rule applied: `GOVERNANCE-EQ-v1`

## Active Cross-Repo Delivery

- Destination: `eCommsZone`
- Transport: HTTPS webhook
- Source system: `AccountFinanceZone`
- Direct Cyrano delivery is not permitted from this repository

## Endpoint Configuration

- `ECOMMSZONE_WEBHOOK_URL`: required to forward published finance events
- `ECOMMSZONE_WEBHOOK_SECRET`: optional shared secret for `sha256=` HMAC signing

## Headers

- `content-type: application/json`
- `x-oqmi-contract-version: 1.1`
- `x-oqmi-rule-applied-id: GOVERNANCE-EQ-v1`
- `x-oqmi-source-system: AccountFinanceZone`
- `x-oqmi-signature-sha256: sha256=<hex digest>` when `ECOMMSZONE_WEBHOOK_SECRET` is configured

## Payload

```json
{
  "contractVersion": "1.1",
  "destination": "eCommsZone",
  "source": "AccountFinanceZone",
  "ruleAppliedId": "GOVERNANCE-EQ-v1",
  "event": {
    "type": "PaymentProcessed",
    "aggregateId": "txn_123",
    "payload": {},
    "emittedAt": "2026-05-13T00:00:00.000Z"
  },
  "deliveredAt": "2026-05-13T00:00:00.000Z"
}
```

## Delivery Rules

- Webhook forwarding is best-effort and must not block the local append-only financial control path
- The payload envelope is the canonical contract for future webhook or NATS bridge fan-out
- Consumers must treat unknown payload fields as forward-compatible additions
