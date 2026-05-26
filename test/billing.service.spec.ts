import { BillingService } from '../src/billing/billing.service';
import { ComplianceGuard } from '../src/compliance/compliance.guard';
import { ComplianceService } from '../src/compliance/compliance.service';
import { EventPublisher } from '../src/events/event.publisher';
import { LedgerService } from '../src/ledger/ledger.service';
import { PayoutService } from '../src/payouts/payout.service';

describe('BillingService', () => {
  const createService = (): BillingService => {
    const payoutService = new PayoutService(
      new ComplianceGuard(new ComplianceService()),
      new LedgerService(),
      new EventPublisher(),
    );
    return new BillingService(payoutService);
  };

  describe('getRevenueShareBpsForTier', () => {
    it('returns 0 BPS for FREE tier', () => {
      const service = createService();
      expect(service.getRevenueShareBpsForTier('FREE')).toBe(0);
    });

    it('returns 5000 BPS (50%) for BASIC tier', () => {
      const service = createService();
      expect(service.getRevenueShareBpsForTier('BASIC')).toBe(5000);
    });

    it('returns 6000 BPS (60%) for PREMIUM tier', () => {
      const service = createService();
      expect(service.getRevenueShareBpsForTier('PREMIUM')).toBe(6000);
    });

    it('returns 7000 BPS (70%) for ELITE tier', () => {
      const service = createService();
      expect(service.getRevenueShareBpsForTier('ELITE')).toBe(7000);
    });

    it('returns default 5000 BPS (50%) for unknown tier', () => {
      const service = createService();
      expect(service.getRevenueShareBpsForTier('UNKNOWN_TIER')).toBe(5000);
    });

    it('is case-insensitive for tier names', () => {
      const service = createService();
      expect(service.getRevenueShareBpsForTier('basic')).toBe(5000);
      expect(service.getRevenueShareBpsForTier('Premium')).toBe(6000);
      expect(service.getRevenueShareBpsForTier('ELITE')).toBe(7000);
    });
  });

  describe('consumeSubscriptionTierChange', () => {
    it('processes tier change event without error', () => {
      const service = createService();

      expect(() =>
        service.consumeSubscriptionTierChange({
          accountId: 'acct_123',
          previousTier: 'BASIC',
          newTier: 'PREMIUM',
          occurredAt: new Date().toISOString(),
        }),
      ).not.toThrow();
    });
  });

  describe('linkAccountToCreator', () => {
    it('links fan account to creator account', () => {
      const service = createService();

      service.linkAccountToCreator({
        accountId: 'fan_123',
        creatorAccountId: 'creator_456',
        linkType: 'FAN_CLUB_SUBSCRIPTION',
        occurredAt: new Date().toISOString(),
      });

      expect(service.getLinkedCreator('fan_123')).toBe('creator_456');
    });

    it('returns undefined for unlinked account', () => {
      const service = createService();
      expect(service.getLinkedCreator('fan_unlinked')).toBeUndefined();
    });

    it('supports multiple account linking types', () => {
      const service = createService();

      service.linkAccountToCreator({
        accountId: 'fan_content',
        creatorAccountId: 'creator_content',
        linkType: 'CONTENT_PURCHASE',
        occurredAt: new Date().toISOString(),
      });

      service.linkAccountToCreator({
        accountId: 'fan_tip',
        creatorAccountId: 'creator_tip',
        linkType: 'TIP',
        occurredAt: new Date().toISOString(),
      });

      expect(service.getLinkedCreator('fan_content')).toBe('creator_content');
      expect(service.getLinkedCreator('fan_tip')).toBe('creator_tip');
    });
  });

  describe('calculateAndIssuePayoutForTransaction', () => {
    it('calculates and issues payout for BASIC tier (50%)', () => {
      const service = createService();

      const payoutId = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 10000n, // $100.00
        creatorAccountId: 'creator_basic',
        tier: 'BASIC',
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_basic',
      });

      expect(payoutId).toBeDefined();
      expect(payoutId?.startsWith('po_')).toBe(true);
    });

    it('calculates and issues payout for PREMIUM tier (60%)', () => {
      const service = createService();

      const payoutId = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 10000n, // $100.00
        creatorAccountId: 'creator_premium',
        tier: 'PREMIUM',
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_premium',
      });

      expect(payoutId).toBeDefined();
      expect(payoutId?.startsWith('po_')).toBe(true);
    });

    it('calculates and issues payout for ELITE tier (70%)', () => {
      const service = createService();

      const payoutId = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 10000n, // $100.00
        creatorAccountId: 'creator_elite',
        tier: 'ELITE',
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_elite',
      });

      expect(payoutId).toBeDefined();
      expect(payoutId?.startsWith('po_')).toBe(true);
    });

    it('returns null for FREE tier (0% revenue share)', () => {
      const service = createService();

      const payoutId = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 10000n,
        creatorAccountId: 'creator_free',
        tier: 'FREE',
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_free',
      });

      expect(payoutId).toBeNull();
    });

    it('integrates revenue share calculation with payout issuance', () => {
      const payoutService = new PayoutService(
        new ComplianceGuard(new ComplianceService()),
        new LedgerService(),
        new EventPublisher(),
      );
      const service = new BillingService(payoutService);

      const payoutId = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 10000n, // $100.00
        creatorAccountId: 'creator_integration',
        tier: 'BASIC', // 50%
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_integration',
      });

      expect(payoutId).toBeDefined();

      // Verify the payout was created with correct amount (50% of $100)
      const records = payoutService.getReconciliationRecordsForCreator(
        'creator_integration',
      );
      expect(records).toHaveLength(1);
      expect(records[0].amountMinor).toBe(5000n); // $50.00 (50% of $100)
      expect(records[0].revenueShareBps).toBe(5000);
    });

    it('handles multiple transactions for the same creator', () => {
      const payoutService = new PayoutService(
        new ComplianceGuard(new ComplianceService()),
        new LedgerService(),
        new EventPublisher(),
      );
      const service = new BillingService(payoutService);

      // First transaction: BASIC tier (50%)
      const payout1 = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 10000n, // $100.00
        creatorAccountId: 'creator_multi',
        tier: 'BASIC',
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_multi_1',
      });

      // Second transaction: PREMIUM tier (60%)
      const payout2 = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 20000n, // $200.00
        creatorAccountId: 'creator_multi',
        tier: 'PREMIUM',
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_multi_2',
      });

      expect(payout1).toBeDefined();
      expect(payout2).toBeDefined();

      const records =
        payoutService.getReconciliationRecordsForCreator('creator_multi');
      expect(records).toHaveLength(2);

      // First payout: 50% of $100 = $50
      expect(records[0].amountMinor).toBe(5000n);
      expect(records[0].revenueShareBps).toBe(5000);

      // Second payout: 60% of $200 = $120
      expect(records[1].amountMinor).toBe(12000n);
      expect(records[1].revenueShareBps).toBe(6000);
    });
  });

  describe('end-to-end revenue share workflow', () => {
    it('processes fan club subscription with correct revenue share', () => {
      const payoutService = new PayoutService(
        new ComplianceGuard(new ComplianceService()),
        new LedgerService(),
        new EventPublisher(),
      );
      const service = new BillingService(payoutService);

      // Step 1: Link fan to creator
      service.linkAccountToCreator({
        accountId: 'fan_e2e',
        creatorAccountId: 'creator_e2e',
        linkType: 'FAN_CLUB_SUBSCRIPTION',
        occurredAt: new Date().toISOString(),
      });

      expect(service.getLinkedCreator('fan_e2e')).toBe('creator_e2e');

      // Step 2: Process tier change for creator
      service.consumeSubscriptionTierChange({
        accountId: 'creator_e2e',
        previousTier: 'FREE',
        newTier: 'PREMIUM',
        occurredAt: new Date().toISOString(),
      });

      // Step 3: Calculate and issue payout based on transaction
      const payoutId = service.calculateAndIssuePayoutForTransaction({
        transactionAmountMinor: 50000n, // $500.00
        creatorAccountId: 'creator_e2e',
        tier: 'PREMIUM', // 60%
        currency: 'CAD',
        ruleAppliedId: 'rule_v1',
        auditTraceId: 'audit_e2e',
      });

      expect(payoutId).toBeDefined();

      // Step 4: Verify payout details
      const records =
        payoutService.getReconciliationRecordsForCreator('creator_e2e');
      expect(records).toHaveLength(1);
      expect(records[0].amountMinor).toBe(30000n); // $300.00 (60% of $500)
      expect(records[0].status).toBe('PENDING');

      // Step 5: Settle the payout
      payoutService.settlePayout(payoutId!);

      const settledRecords =
        payoutService.getReconciliationRecordsForCreator('creator_e2e');
      expect(settledRecords[0].status).toBe('SETTLED');
      expect(settledRecords[0].settledAt).toBeDefined();
    });
  });
});
