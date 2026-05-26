# OQMI Infrastructure and Security Policy (Finance Extract)

This repository implements and references OQMI infrastructure and security controls for financial workloads:

- Canadian data residency only (enforce region guardrails in deployment and runtime checks).
- Least-privilege IAM and service-to-service authentication.
- Encryption in transit (TLS 1.2+) and at rest (managed KMS-backed storage).
- **Separate KMS key configuration**: AccountFinanceZone uses a dedicated AWS KMS key (`alias/accountfinancezone-encryption-key`) isolated from other services, deployed in `ca-central-1` region for Canadian data residency compliance.
- Immutable audit logging for all financial actions.
- PCI-DSS separation of duties: this service uses payment method tokens only and never stores raw PAN/CVV.
- Ledger mutation policy: append-only writes with offset entries; no destructive updates/deletes.
- Cross-repo event delivery must use approved webhook or NATS contracts; direct Cyrano service coupling is prohibited in this repository.
- Webhook deliveries to eCommsZone must use the v1.1 contract envelope with HMAC signing when `ECOMMSZONE_WEBHOOK_SECRET` is configured.
- Classic branch protection should require `ci`, `super-linter`, and `ship-gate` before merge.

## KMS Key Management

### Key Isolation
- **Dedicated KMS Key**: Separate encryption key for AccountFinanceZone financial data
- **Key Alias**: `alias/accountfinancezone-encryption-key`
- **Region**: `ca-central-1` (Canadian data residency)
- **Scope**: Encryption at rest for database and tokenized payment data

### Configuration
Required environment variables:
- `AWS_REGION=ca-central-1` (enforced at runtime)
- `AWS_KMS_KEY_ID` (ARN of the KMS key)
- `AWS_KMS_KEY_ALIAS=alias/accountfinancezone-encryption-key`
- `DB_ENCRYPTION_ENABLED=true` (production requirement)

### Database Encryption
- PostgreSQL 16 with pgcrypto extension enabled
- Column-level encryption for sensitive tokenized data
- Encryption at rest for all financial records
- Automatic key rotation policy enforced at infrastructure level

