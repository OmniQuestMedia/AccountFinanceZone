export interface FinancialWriteContext {
  ruleAppliedId: string;
  auditTraceId: string;
  sourceEventId?: string;
  idempotencyKey?: string;
  /**
   * Cross-service correlation identifier. Threads a single business operation
   * (checkout, chargeback, payout) across AccountFinanceZone, GateGuard,
   * eCommsZone and the payment processor so the ledger entry can be tied back
   * to its originating request during audit and reconciliation.
   */
  correlationId?: string;
}

export interface CheckoutConfirmation {
  transactionId: string;
  userId: string;
  amountMinor: bigint;
  currency: string;
  bucketBreakdown: Array<{ bucket: string; amountMinor: bigint }>;
  gateguardAuthToken: string;
  confirmedAt: string;
}

export interface MoneyMovementRequest {
  accountId: string;
  amountMinor: bigint;
  currency: string;
  paymentTokenId: string;
  context: FinancialWriteContext;
}
