# OQMI Infrastructure and Security Policy (Finance Extract)

This repository implements and references OQMI infrastructure and security controls for financial workloads:

- Canadian data residency only (enforce region guardrails in deployment and runtime checks).
- Least-privilege IAM and service-to-service authentication.
- Encryption in transit (TLS 1.2+) and at rest (managed KMS-backed storage).
- Immutable audit logging for all financial actions.
- PCI-DSS separation of duties: this service uses payment method tokens only and never stores raw PAN/CVV.
- Ledger mutation policy: append-only writes with offset entries; no destructive updates/deletes.
