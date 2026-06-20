import { AmlService } from '../src/compliance/aml.service';

describe('AmlService', () => {
  let service: AmlService;
  const NOW = new Date('2024-01-15T12:00:00Z').getTime();

  beforeEach(() => {
    service = new AmlService();
  });

  it('flags THRESHOLD_EXCEEDED for amounts >= $10,000 CAD', () => {
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 1_000_000n,
      recentTransactions: [],
      nowMs: NOW,
    });
    expect(result.flags).toContain('THRESHOLD_EXCEEDED');
    expect(result.requiresManualReview).toBe(true);
  });

  it('does not flag THRESHOLD_EXCEEDED for amounts below $10,000 CAD', () => {
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 999_999n,
      recentTransactions: [],
      nowMs: NOW,
    });
    expect(result.flags).not.toContain('THRESHOLD_EXCEEDED');
  });

  it('flags PEP_SCREENING_REQUIRED for amounts >= $1,000 CAD', () => {
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 100_000n,
      recentTransactions: [],
      nowMs: NOW,
    });
    expect(result.flags).toContain('PEP_SCREENING_REQUIRED');
  });

  it('does not flag PEP_SCREENING_REQUIRED for amounts below $1,000 CAD', () => {
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 99_999n,
      recentTransactions: [],
      nowMs: NOW,
    });
    expect(result.flags).not.toContain('PEP_SCREENING_REQUIRED');
  });

  it('flags STRUCTURING_DETECTED when 3+ transactions total >= $10,000 in 24h', () => {
    const recent = [
      { amountMinor: 400_000n, occurredAt: new Date(NOW - 3600_000) },
      { amountMinor: 400_000n, occurredAt: new Date(NOW - 7200_000) },
    ];
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 300_000n,
      recentTransactions: recent,
      nowMs: NOW,
    });
    expect(result.flags).toContain('STRUCTURING_DETECTED');
  });

  it('does not flag STRUCTURING_DETECTED when total is below $10,000', () => {
    const recent = [
      { amountMinor: 100_000n, occurredAt: new Date(NOW - 3600_000) },
      { amountMinor: 100_000n, occurredAt: new Date(NOW - 7200_000) },
    ];
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 100_000n,
      recentTransactions: recent,
      nowMs: NOW,
    });
    expect(result.flags).not.toContain('STRUCTURING_DETECTED');
  });

  it('returns clean result for a small low-risk transaction', () => {
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 500n,
      recentTransactions: [],
      nowMs: NOW,
    });
    expect(result.flags).toHaveLength(0);
    expect(result.requiresManualReview).toBe(false);
  });
});
