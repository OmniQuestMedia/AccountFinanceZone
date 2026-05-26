export type FinanceEventType =
  | 'PaymentProcessed'
  | 'PayoutIssued'
  | 'PayoutSettled'
  | 'PayoutFailed'
  | 'RefundInitiated'
  | 'ChargebackRegistered'
  | 'FraudFlagRaised';

export interface FinanceEvent<TPayload = Record<string, unknown>> {
  type: FinanceEventType;
  aggregateId: string;
  payload: TPayload;
  emittedAt: string;
}
