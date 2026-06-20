import { WalletBalance, WalletService } from '../src/wallet/wallet.service';

describe('WalletService — three-bucket spend order (Canonical Corpus v11)', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService();
  });

  describe('computeDebitAllocation', () => {
    it('debits promotional bucket first when balance is sufficient', () => {
      const balance: WalletBalance = {
        promotional: 500n,
        rewards: 500n,
        cash: 500n,
      };
      const result = service.computeDebitAllocation(balance, 400n);
      expect(result.bucketDebits).toHaveLength(1);
      expect(result.bucketDebits[0]).toEqual({
        bucket: 'promotional',
        amountMinor: 400n,
      });
      expect(result.totalDebited).toBe(400n);
    });

    it('spills from promotional into rewards when promotional is exhausted', () => {
      const balance: WalletBalance = {
        promotional: 300n,
        rewards: 500n,
        cash: 500n,
      };
      const result = service.computeDebitAllocation(balance, 400n);
      expect(result.bucketDebits).toHaveLength(2);
      expect(result.bucketDebits[0]).toEqual({
        bucket: 'promotional',
        amountMinor: 300n,
      });
      expect(result.bucketDebits[1]).toEqual({
        bucket: 'rewards',
        amountMinor: 100n,
      });
    });

    it('spills all the way to cash when both promotional and rewards are exhausted', () => {
      const balance: WalletBalance = {
        promotional: 100n,
        rewards: 100n,
        cash: 800n,
      };
      const result = service.computeDebitAllocation(balance, 500n);
      expect(result.totalDebited).toBe(500n);
      const cashDebit = result.bucketDebits.find((d) => d.bucket === 'cash');
      expect(cashDebit?.amountMinor).toBe(300n);
    });

    it('skips empty promotional and debits rewards directly', () => {
      const balance: WalletBalance = {
        promotional: 0n,
        rewards: 600n,
        cash: 400n,
      };
      const result = service.computeDebitAllocation(balance, 200n);
      expect(result.bucketDebits).toHaveLength(1);
      expect(result.bucketDebits[0].bucket).toBe('rewards');
    });

    it('throws when total balance is insufficient', () => {
      const balance: WalletBalance = {
        promotional: 100n,
        rewards: 50n,
        cash: 50n,
      };
      expect(() => service.computeDebitAllocation(balance, 500n)).toThrow(
        'Insufficient wallet balance',
      );
    });

    it('throws on non-positive debit amount', () => {
      const balance: WalletBalance = {
        promotional: 1000n,
        rewards: 0n,
        cash: 0n,
      };
      expect(() => service.computeDebitAllocation(balance, 0n)).toThrow(
        'Debit amount must be positive',
      );
    });
  });

  describe('issuePromotionalCredit — VIP Refund Protocol', () => {
    it('issues credit to promotional bucket only', () => {
      const result = service.issuePromotionalCredit({
        amountMinor: 500n,
        reason: 'VIP refund for txn_abc',
      });
      expect(result.bucket).toBe('promotional');
      expect(result.amountMinor).toBe(500n);
    });

    it('throws on non-positive credit amount', () => {
      expect(() =>
        service.issuePromotionalCredit({ amountMinor: 0n, reason: 'test' }),
      ).toThrow('Credit amount must be positive');
    });
  });

  describe('computeBalance', () => {
    it('sums credits and subtracts debits per bucket', () => {
      const credits = [
        { bucket: 'cash' as const, amountMinor: 1000n },
        { bucket: 'promotional' as const, amountMinor: 200n },
      ];
      const debits = [{ bucket: 'cash' as const, amountMinor: 300n }];
      const balance = service.computeBalance(credits, debits);
      expect(balance.cash).toBe(700n);
      expect(balance.promotional).toBe(200n);
      expect(balance.rewards).toBe(0n);
    });

    it('throws when a bucket goes negative — invariant violation', () => {
      const credits = [{ bucket: 'cash' as const, amountMinor: 100n }];
      const debits = [{ bucket: 'cash' as const, amountMinor: 200n }];
      expect(() => service.computeBalance(credits, debits)).toThrow(
        "Bucket 'cash' balance is negative",
      );
    });
  });
});
