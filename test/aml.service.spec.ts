import {
  AmlService,
  AmlTransactionRecord,
} from '../src/compliance/aml.service';

describe('AmlService — FINTRAC/AML posture', () => {
  let service: AmlService;

  beforeEach(() => {
    service = new AmlService();
  });

  it('flags transactions at or above CAD $10,000 threshold', () => {
    const result = service.check({
      accountId: 'acct_1',
      amountMinor: 1_000_000n,
      currency: 'CAD',
    });
    expect(result.flagged).toBe(true);
    expect(result.flags).toContain('THRESHOLD_EXCEEDED');
  });

  it('does not flag THRESHOLD_EXCEEDED below CAD $10,000', () => {
    const result = service.check({
      accountId: 'acct_2',
      amountMinor: 999_999n,
      currency: 'CAD',
    });
    expect(result.flags).not.toContain('THRESHOLD_EXCEEDED');
  });

  it('requires PEP screening at or above CAD $1,000', () => {
    const result = service.check({
      accountId: 'acct_3',
      amountMinor: 100_000n,
      currency: 'CAD',
    });
    expect(result.flagged).toBe(true);
    expect(result.flags).toContain('PEP_SCREENING_REQUIRED');
  });

  it('does not require PEP screening below CAD $1,000', () => {
    const result = service.check({
      accountId: 'acct_4',
      amountMinor: 99_999n,
      currency: 'CAD',
    });
    expect(result.flags).not.toContain('PEP_SCREENING_REQUIRED');
  });

  it('detects structuring: 3+ transactions totalling >= $10,000 in 24h window', () => {
    const now = new Date().toISOString();
    const recentTransactions: AmlTransactionRecord[] = [
      { amountMinor: 400_000n, occurredAt: now },
      { amountMinor: 350_000n, occurredAt: now },
    ];
    const result = service.check({
      accountId: 'acct_5',
      amountMinor: 300_000n,
      currency: 'CAD',
      recentTransactions,
    });
    expect(result.flags).toContain('STRUCTURING_DETECTED');
  });

  it('does not flag structuring when total is below $10,000', () => {
    const now = new Date().toISOString();
    const recentTransactions: AmlTransactionRecord[] = [
      { amountMinor: 100_000n, occurredAt: now },
      { amountMinor: 100_000n, occurredAt: now },
    ];
    const result = service.check({
      accountId: 'acct_6',
      amountMinor: 100_000n,
      currency: 'CAD',
      recentTransactions,
    });
    expect(result.flags).not.toContain('STRUCTURING_DETECTED');
  });

  it('returns unflagged result for a small, clean transaction', () => {
    const result = service.check({
      accountId: 'acct_7',
      amountMinor: 5_000n,
      currency: 'CAD',
    });
    expect(result.flagged).toBe(false);
    expect(result.flags).toHaveLength(0);
  });
});
