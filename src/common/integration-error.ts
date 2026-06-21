/**
 * Stable, consumer-facing error contract for AccountFinanceZone.
 *
 * Consumer services (Rewards, Marketplace, OKIB, Compliance) branch on the
 * machine-readable {@link IntegrationErrorCode} — never on free-text messages,
 * which may change. The `retryable` flag tells a consumer whether re-attempting
 * the same call could succeed (transient) or whether it will always fail until
 * the request itself changes (terminal).
 *
 * The serialized shape returned by {@link IntegrationError.toJSON} is the
 * canonical error envelope documented in docs/ERROR_CONTRACT.md.
 */
export enum IntegrationErrorCode {
  // 400 — caller-supplied data is malformed or fails a business rule
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_EVENT_PAYLOAD = 'INVALID_EVENT_PAYLOAD',
  UNSUPPORTED_PAYOUT_METHOD = 'UNSUPPORTED_PAYOUT_METHOD',
  AMOUNT_BELOW_MINIMUM = 'AMOUNT_BELOW_MINIMUM',

  // 401 / 403 — identity / authorization
  CREATOR_CONTEXT_REQUIRED = 'CREATOR_CONTEXT_REQUIRED',

  // 404 — resource not found (or not owned by caller)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

  // 409 — idempotency / state conflicts
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  CONFLICTING_STATE = 'CONFLICTING_STATE',

  // 422 — request understood but cannot be fulfilled under finance invariants
  COMPLIANCE_BLOCKED = 'COMPLIANCE_BLOCKED',
  FRAUD_BLOCKED = 'FRAUD_BLOCKED',
  CASH_REFUND_PROHIBITED = 'CASH_REFUND_PROHIBITED',
  INSUFFICIENT_WALLET_BALANCE = 'INSUFFICIENT_WALLET_BALANCE',

  // 503 — transient downstream/dependency failure
  DOWNSTREAM_UNAVAILABLE = 'DOWNSTREAM_UNAVAILABLE',
}

const HTTP_STATUS_BY_CODE: Record<IntegrationErrorCode, number> = {
  [IntegrationErrorCode.VALIDATION_FAILED]: 400,
  [IntegrationErrorCode.INVALID_EVENT_PAYLOAD]: 400,
  [IntegrationErrorCode.UNSUPPORTED_PAYOUT_METHOD]: 400,
  [IntegrationErrorCode.AMOUNT_BELOW_MINIMUM]: 400,
  [IntegrationErrorCode.CREATOR_CONTEXT_REQUIRED]: 401,
  [IntegrationErrorCode.RESOURCE_NOT_FOUND]: 404,
  [IntegrationErrorCode.DUPLICATE_REQUEST]: 409,
  [IntegrationErrorCode.CONFLICTING_STATE]: 409,
  [IntegrationErrorCode.COMPLIANCE_BLOCKED]: 422,
  [IntegrationErrorCode.FRAUD_BLOCKED]: 422,
  [IntegrationErrorCode.CASH_REFUND_PROHIBITED]: 422,
  [IntegrationErrorCode.INSUFFICIENT_WALLET_BALANCE]: 422,
  [IntegrationErrorCode.DOWNSTREAM_UNAVAILABLE]: 503,
};

// Only transient conditions are safe for a consumer to blindly retry.
const RETRYABLE_CODES: ReadonlySet<IntegrationErrorCode> = new Set([
  IntegrationErrorCode.DOWNSTREAM_UNAVAILABLE,
]);

export interface IntegrationErrorEnvelope {
  error: {
    code: IntegrationErrorCode;
    message: string;
    httpStatus: number;
    retryable: boolean;
    /** Optional structured context (field names, limits, etc.). */
    details?: Record<string, unknown>;
    /** Echoed correlation id when one is available, for cross-zone tracing. */
    correlationId?: string;
  };
}

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly correlationId?: string;

  constructor(
    code: IntegrationErrorCode,
    message: string,
    options: {
      details?: Record<string, unknown>;
      correlationId?: string;
    } = {},
  ) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
    this.httpStatus = HTTP_STATUS_BY_CODE[code];
    this.retryable = RETRYABLE_CODES.has(code);
    this.details = options.details;
    this.correlationId = options.correlationId;
  }

  /** Serialize to the canonical cross-zone error envelope. */
  toJSON(): IntegrationErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        httpStatus: this.httpStatus,
        retryable: this.retryable,
        ...(this.details ? { details: this.details } : {}),
        ...(this.correlationId ? { correlationId: this.correlationId } : {}),
      },
    };
  }
}

/** Type guard so consumers/handlers can distinguish contract errors. */
export function isIntegrationError(err: unknown): err is IntegrationError {
  return err instanceof IntegrationError;
}
