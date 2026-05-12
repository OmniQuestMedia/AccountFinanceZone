export type FinanceEventType =
  | 'PaymentProcessed'
  | 'PayoutIssued'
  | 'RefundInitiated'
  | 'ChargebackRegistered'
  | 'FraudFlagRaised';

export interface FinanceEvent<TPayload = Record<string, unknown>> {
  type: FinanceEventType;
  aggregateId: string;
  payload: TPayload;
  emittedAt: string;
}
