import { WalletService, WalletBalance } from '../src/wallet/wallet.service';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService();
  });

  describe('computeDebitAllocation', () => {
    it('drains promotional bucket first', () => {
      const balance: WalletBalance = { promotional: 500n, rewards: 500n, cash: 500n };
      const result = service.computeDebitAllocation(balance, 400n);
      expect(result.allocations).toEqual([{ bucket: 'promotional', amountMinor: 400n }]);
      expect(result.totalDebited).toBe(400n);
    });

    it('spills from promotional into rewards', () => {
      const balance: WalletBalance = { promotional: 200n, rewards: 500n, cash: 500n };
      const result = service.computeDebitAllocation(balance, 500n);
      expect(result.allocations).toEqual([
        { bucket: 'promotional', amountMinor: 200n },
        { bucket: 'rewards', amountMinor: 300n },
      ]);
    });

    it('spills across all three buckets', () => {
      const balance: WalletBalance = { promotional: 100n, rewards: 200n, cash: 700n };
      const result = service.computeDebitAllocation(balance, 1000n);
      expect(result.allocations).toEqual([
        { bucket: 'promotional', amountMinor: 100n },
        { bucket: 'rewards', amountMinor: 200n },
        { bucket: 'cash', amountMinor: 700n },
      ]);
    });

    it('skips empty buckets', () => {
      const balance: WalletBalance = { promotional: 0n, rewards: 500n, cash: 0n };
      const result = service.computeDebitAllocation(balance, 300n);
      expect(result.allocations).toEqual([{ bucket: 'rewards', amountMinor: 300n }]);
    });

    it('throws when balance is insufficient', () => {
      const balance: WalletBalance = { promotional: 100n, rewards: 50n, cash: 50n };
      expect(() => service.computeDebitAllocation(balance, 500n)).toThrow(
        'Insufficient wallet balance',
      );
    });

    it('throws when amount is not positive', () => {
      const balance: WalletBalance = { promotional: 1000n, rewards: 0n, cash: 0n };
      expect(() => service.computeDebitAllocation(balance, 0n)).toThrow(
        'Debit amount must be positive',
      );
    });
  });

  describe('issuePromotionalCredit', () => {
    it('returns a promotional credit with the correct bucket', () => {
      const credit = service.issuePromotionalCredit({
        amountMinor: 500n,
        reason: 'VIP refund',
      });
      expect(credit.bucket).toBe('promotional');
      expect(credit.amountMinor).toBe(500n);
      expect(credit.reason).toBe('VIP refund');
    });
  });

  describe('computeBalance', () => {
    it('returns correct balance from credits and debits', () => {
      const credits = [
        { bucket: 'cash' as const, amountMinor: 1000n },
        { bucket: 'rewards' as const, amountMinor: 500n },
      ];
      const debits = [{ bucket: 'cash' as const, amountMinor: 300n }];
      const balance = service.computeBalance(credits, debits);
      expect(balance.cash).toBe(700n);
      expect(balance.rewards).toBe(500n);
      expect(balance.promotional).toBe(0n);
    });

    it('throws if any bucket goes negative', () => {
      const credits = [{ bucket: 'cash' as const, amountMinor: 100n }];
      const debits = [{ bucket: 'cash' as const, amountMinor: 200n }];
      expect(() => service.computeBalance(credits, debits)).toThrow(
        "Wallet bucket 'cash' went negative",
      );
    });
  });
});
