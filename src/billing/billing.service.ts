import { Injectable } from '@nestjs/common';

export interface SubscriptionPlanChangeEvent {
  accountId: string;
  previousTier: string;
  newTier: string;
  occurredAt: string;
}

export interface TaxReportingHookInput {
  transactionId: string;
  accountId: string;
  amountMinor: bigint;
  currency: string;
  countryCode: string;
}

@Injectable()
export class BillingService {
  // Consumes AccountsZone events where tier changes can alter payout rules.
  consumeSubscriptionTierChange(_event: SubscriptionPlanChangeEvent): void {
    // Integration hook for AccountsZone event stream.
  }

  queueTaxReportingHook(_input: TaxReportingHookInput): void {
    // Integration hook for tax engine / statutory reporting pipelines.
  }
}
