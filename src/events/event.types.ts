export type FinanceEventType =
  | 'PaymentProcessed'
  | 'PayoutIssued'
  | 'PayoutSettled'
  | 'PayoutFailed'
  | 'RefundInitiated'
  | 'ChargebackRegistered'
  | 'FraudFlagRaised'
  | 'payout.requested'
  | 'payout.settled'
  | 'theatre.block.settled'
  | 'PromotionalCreditIssued';

export interface FinanceEvent<TPayload = Record<string, unknown>> {
  type: FinanceEventType;
  aggregateId: string;
  payload: TPayload;
  emittedAt: string;
}
