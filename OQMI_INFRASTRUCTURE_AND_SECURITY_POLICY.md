# OQMI Infrastructure and Security Policy (Finance Extract)

This repository implements and references OQMI infrastructure and security controls for financial workloads:

- Canadian data residency only (enforce region guardrails in deployment and runtime checks).
- Least-privilege IAM and service-to-service authentication.
- Encryption in transit (TLS 1.2+) and at rest (managed KMS-backed storage).
- Immutable audit logging for all financial actions.
- PCI-DSS separation of duties: this service uses payment method tokens only and never stores raw PAN/CVV.
- Ledger mutation policy: append-only writes with offset entries; no destructive updates/deletes.
- Cross-repo event delivery must use approved webhook or NATS contracts; direct Cyrano service coupling is prohibited in this repository.
- Webhook deliveries to eCommsZone must use the v1.1 contract envelope with HMAC signing when `ECOMMSZONE_WEBHOOK_SECRET` is configured.
- Classic branch protection should require `ci`, `super-linter`, and `ship-gate` before merge.
