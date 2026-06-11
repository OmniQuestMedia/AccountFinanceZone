import { Injectable } from '@nestjs/common';
import { PayoutService } from '../payouts/payout.service';

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

export interface AccountLinkingEvent {
  accountId: string;
  creatorAccountId: string;
  linkType: 'FAN_CLUB_SUBSCRIPTION' | 'CONTENT_PURCHASE' | 'TIP';
  occurredAt: string;
}

// Tier-based revenue share configuration
const TIER_REVENUE_SHARE_BPS: Record<string, number> = {
  FREE: 0, // No revenue share for free tier
  BASIC: 5000, // 50% revenue share
  PREMIUM: 6000, // 60% revenue share
  ELITE: 7000, // 70% revenue share
};

@Injectable()
export class BillingService {
  private readonly accountLinks: Map<string, string> = new Map(); // accountId -> creatorAccountId

  constructor(private readonly payoutService?: PayoutService) {}

  /**
   * Consumes AccountsZone events where tier changes can alter payout rules.
   * Updates the revenue share percentage based on the new subscription tier.
   */
  consumeSubscriptionTierChange(event: SubscriptionPlanChangeEvent): void {
    const newRevenueShareBps = this.getRevenueShareBpsForTier(event.newTier);

    // Log tier change for audit purposes
    console.log(
      `Account ${event.accountId} changed from ${event.previousTier} to ${event.newTier}. ` +
        `New revenue share: ${newRevenueShareBps / 100}%`,
    );

    // Future: Store tier changes in database for historical tracking
    // Future: Trigger recalculation of pending payouts if tier affects them
  }

  /**
   * Get the revenue share basis points for a given subscription tier.
   * Returns the configured BPS or defaults to 50% (5000 BPS) for unknown tiers.
   */
  getRevenueShareBpsForTier(tier: string): number {
    return TIER_REVENUE_SHARE_BPS[tier.toUpperCase()] ?? 5000;
  }

  /**
   * Link a fan account to a creator account for revenue tracking.
   * This is called when AccountsZone sends account linking events
   * (e.g., when a fan subscribes to a creator's Fan Club).
   */
  linkAccountToCreator(event: AccountLinkingEvent): void {
    this.accountLinks.set(event.accountId, event.creatorAccountId);

    console.log(
      `Linked account ${event.accountId} to creator ${event.creatorAccountId} ` +
        `(type: ${event.linkType}) at ${event.occurredAt}`,
    );

    // Future: Store in database for persistent account linking
    // Future: Emit event for downstream systems
  }

  /**
   * Get the creator account ID linked to a fan account.
   * Returns undefined if no link exists.
   */
  getLinkedCreator(accountId: string): string | undefined {
    return this.accountLinks.get(accountId);
  }

  /**
   * Calculate and issue payout for a creator based on a transaction amount and tier.
   * This integrates revenue share calculation with payout issuance.
   */
  calculateAndIssuePayoutForTransaction(params: {
    transactionAmountMinor: bigint;
    creatorAccountId: string;
    tier: string;
    currency: string;
    ruleAppliedId: string;
    auditTraceId: string;
  }): string | null {
    if (!this.payoutService) {
      throw new Error('PayoutService not available');
    }

    const revenueShareBps = this.getRevenueShareBpsForTier(params.tier);

    // No payout if revenue share is 0
    if (revenueShareBps === 0) {
      return null;
    }

    const revenueShare = this.payoutService.calculateRevenueShare({
      transactionAmountMinor: params.transactionAmountMinor,
      revenueShareBps,
    });

    // Only issue payout if there's a creator share
    if (revenueShare.creatorShareMinor > 0n) {
      return this.payoutService.issuePayout({
        creatorAccountId: params.creatorAccountId,
        amountMinor: revenueShare.creatorShareMinor,
        currency: params.currency,
        revenueShareBps,
        context: {
          ruleAppliedId: params.ruleAppliedId,
          auditTraceId: params.auditTraceId,
        },
      });
    }

    return null;
  }

  queueTaxReportingHook(_input: TaxReportingHookInput): void {
    // Integration hook for tax engine / statutory reporting pipelines.
  }
}
