import { ComplianceGuard } from '../src/compliance/compliance.guard';
import { ComplianceService } from '../src/compliance/compliance.service';
import { EventPublisher } from '../src/events/event.publisher';
import { LedgerService } from '../src/ledger/ledger.service';
import { PayoutService } from '../src/payouts/payout.service';

describe('PayoutService', () => {
  const createService = (): PayoutService =>
    new PayoutService(
      new ComplianceGuard(new ComplianceService()),
      new LedgerService(),
      new EventPublisher(),
    );

  describe('calculateRevenueShare', () => {
    it('calculates correct revenue share for 25% (2500 BPS)', () => {
      const service = createService();

      const result = service.calculateRevenueShare({
        transactionAmountMinor: 10000n, // $100.00
        revenueShareBps: 2500, // 25%
      });

      expect(result.creatorShareMinor).toBe(2500n); // $25.00
      expect(result.platformShareMinor).toBe(7500n); // $75.00
      expect(result.totalMinor).toBe(10000n); // $100.00
    });

    it('calculates correct revenue share for 50% (5000 BPS)', () => {
      const service = createService();

      const result = service.calculateRevenueShare({
        transactionAmountMinor: 10000n,
        revenueShareBps: 5000, // 50%
      });

      expect(result.creatorShareMinor).toBe(5000n); // $50.00
      expect(result.platformShareMinor).toBe(5000n); // $50.00
      expect(result.totalMinor).toBe(10000n);
    });

    it('calculates correct revenue share for 70% (7000 BPS)', () => {
      const service = createService();

      const result = service.calculateRevenueShare({
        transactionAmountMinor: 10000n,
        revenueShareBps: 7000, // 70%
      });

      expect(result.creatorShareMinor).toBe(7000n); // $70.00
      expect(result.platformShareMinor).toBe(3000n); // $30.00
      expect(result.totalMinor).toBe(10000n);
    });

    it('handles 0% revenue share (0 BPS)', () => {
      const service = createService();

      const result = service.calculateRevenueShare({
        transactionAmountMinor: 10000n,
        revenueShareBps: 0, // 0%
      });

      expect(result.creatorShareMinor).toBe(0n);
      expect(result.platformShareMinor).toBe(10000n);
      expect(result.totalMinor).toBe(10000n);
    });

    it('handles 100% revenue share (10000 BPS)', () => {
      const service = createService();

      const result = service.calculateRevenueShare({
        transactionAmountMinor: 10000n,
        revenueShareBps: 10000, // 100%
      });

      expect(result.creatorShareMinor).toBe(10000n);
      expect(result.platformShareMinor).toBe(0n);
      expect(result.totalMinor).toBe(10000n);
    });

    it('rounds down creator share with fractional amounts', () => {
      const service = createService();

      // 33.33% of $1.00 = $0.3333
      const result = service.calculateRevenueShare({
        transactionAmountMinor: 100n, // $1.00
        revenueShareBps: 3333, // 33.33%
      });

      expect(result.creatorShareMinor).toBe(33n); // $0.33 (rounded down)
      expect(result.platformShareMinor).toBe(67n); // $0.67 (remainder)
      expect(result.totalMinor).toBe(100n);
      // Ensure no money is lost in rounding
      expect(result.creatorShareMinor + result.platformShareMinor).toBe(result.totalMinor);
    });

    it('throws error for negative BPS', () => {
      const service = createService();

      expect(() =>
        service.calculateRevenueShare({
          transactionAmountMinor: 10000n,
          revenueShareBps: -100,
        }),
      ).toThrow('revenueShareBps must be between 0 and 10000 (0-100%)');
    });

    it('throws error for BPS > 10000', () => {
      const service = createService();

      expect(() =>
        service.calculateRevenueShare({
          transactionAmountMinor: 10000n,
          revenueShareBps: 15000,
        }),
      ).toThrow('revenueShareBps must be between 0 and 10000 (0-100%)');
    });

    it('ensures no money is lost in any calculation', () => {
      const service = createService();

      // Test various amounts and BPS combinations
      const testCases = [
        { amount: 12345n, bps: 3333 },
        { amount: 999n, bps: 5000 },
        { amount: 1n, bps: 9999 },
        { amount: 999999n, bps: 6789 },
      ];

      testCases.forEach(({ amount, bps }) => {
        const result = service.calculateRevenueShare({
          transactionAmountMinor: amount,
          revenueShareBps: bps,
        });

        expect(result.creatorShareMinor + result.platformShareMinor).toBe(amount);
        expect(result.totalMinor).toBe(amount);
      });
    });
  });

  describe('issuePayout', () => {
    it('issues payout and creates reconciliation record', () => {
      const service = createService();

      const payoutId = service.issuePayout({
        creatorAccountId: 'creator_123',
        amountMinor: 5000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: {
          ruleAppliedId: 'rule_payout_v1',
          auditTraceId: 'audit_payout_1',
        },
      });

      expect(payoutId.startsWith('po_')).toBe(true);

      const records = service.getReconciliationRecordsForCreator('creator_123');
      expect(records).toHaveLength(1);
      expect(records[0].payoutId).toBe(payoutId);
      expect(records[0].status).toBe('PENDING');
      expect(records[0].amountMinor).toBe(5000n);
      expect(records[0].revenueShareBps).toBe(5000);
    });

    it('creates multiple reconciliation records for different payouts', () => {
      const service = createService();

      const payout1 = service.issuePayout({
        creatorAccountId: 'creator_123',
        amountMinor: 1000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_1' },
      });

      const payout2 = service.issuePayout({
        creatorAccountId: 'creator_123',
        amountMinor: 2000n,
        currency: 'CAD',
        revenueShareBps: 6000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_2' },
      });

      const records = service.getReconciliationRecordsForCreator('creator_123');
      expect(records).toHaveLength(2);
      expect(records[0].payoutId).toBe(payout1);
      expect(records[1].payoutId).toBe(payout2);
    });
  });

  describe('settlePayout', () => {
    it('marks payout as settled and records settlement time', () => {
      const service = createService();

      const payoutId = service.issuePayout({
        creatorAccountId: 'creator_456',
        amountMinor: 3000n,
        currency: 'CAD',
        revenueShareBps: 7000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_settle' },
      });

      service.settlePayout(payoutId);

      const records = service.getReconciliationRecordsForCreator('creator_456');
      expect(records[0].status).toBe('SETTLED');
      expect(records[0].settledAt).toBeDefined();
    });

    it('throws error when settling non-existent payout', () => {
      const service = createService();

      expect(() => service.settlePayout('po_nonexistent')).toThrow(
        'Payout po_nonexistent not found in reconciliation records',
      );
    });

    it('throws error when settling already settled payout', () => {
      const service = createService();

      const payoutId = service.issuePayout({
        creatorAccountId: 'creator_789',
        amountMinor: 1000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_double' },
      });

      service.settlePayout(payoutId);

      expect(() => service.settlePayout(payoutId)).toThrow(
        `Payout ${payoutId} is already settled`,
      );
    });
  });

  describe('failPayout', () => {
    it('marks payout as failed with reason', () => {
      const service = createService();

      const payoutId = service.issuePayout({
        creatorAccountId: 'creator_fail',
        amountMinor: 2000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_fail' },
      });

      service.failPayout(payoutId, 'Insufficient funds');

      const records = service.getReconciliationRecordsForCreator('creator_fail');
      expect(records[0].status).toBe('FAILED');
    });

    it('throws error when failing non-existent payout', () => {
      const service = createService();

      expect(() => service.failPayout('po_nonexistent', 'reason')).toThrow(
        'Payout po_nonexistent not found in reconciliation records',
      );
    });

    it('throws error when failing settled payout', () => {
      const service = createService();

      const payoutId = service.issuePayout({
        creatorAccountId: 'creator_settled',
        amountMinor: 1000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_settled' },
      });

      service.settlePayout(payoutId);

      expect(() => service.failPayout(payoutId, 'reason')).toThrow(
        `Payout ${payoutId} is not in PENDING status`,
      );
    });
  });

  describe('getPendingPayouts', () => {
    it('returns only pending payouts', () => {
      const service = createService();

      const payout1 = service.issuePayout({
        creatorAccountId: 'creator_pending',
        amountMinor: 1000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_1' },
      });

      const payout2 = service.issuePayout({
        creatorAccountId: 'creator_pending',
        amountMinor: 2000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_2' },
      });

      const payout3 = service.issuePayout({
        creatorAccountId: 'creator_pending',
        amountMinor: 3000n,
        currency: 'CAD',
        revenueShareBps: 5000,
        context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_3' },
      });

      service.settlePayout(payout2);
      service.failPayout(payout3, 'test failure');

      const pending = service.getPendingPayouts();
      expect(pending).toHaveLength(1);
      expect(pending[0].payoutId).toBe(payout1);
      expect(pending[0].status).toBe('PENDING');
    });
  });
});
