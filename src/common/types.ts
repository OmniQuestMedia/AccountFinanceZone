export interface FinancialWriteContext {
  ruleAppliedId: string;
  auditTraceId: string;
  sourceEventId?: string;
  idempotencyKey?: string;
}

export interface MoneyMovementRequest {
  accountId: string;
  amountMinor: bigint;
  currency: string;
  paymentTokenId: string;
  context: FinancialWriteContext;
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
