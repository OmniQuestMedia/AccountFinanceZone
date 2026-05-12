export interface FinancialWriteContext {
  ruleAppliedId: string;
  auditTraceId: string;
  sourceEventId?: string;
}

export interface MoneyMovementRequest {
  accountId: string;
  amountMinor: bigint;
  currency: string;
  paymentTokenId: string;
  context: FinancialWriteContext;
}
