import { ComplianceGuard } from '../../src/compliance/compliance.guard';
import { ComplianceService } from '../../src/compliance/compliance.service';

/**
 * Simulates the Compliance / OKIB cross-border gate. Every money movement in
 * AccountFinanceZone passes through ComplianceGuard, which enforces Canadian
 * data residency. Consumer zones that orchestrate cross-border flows must
 * expect a hard rejection here — this test pins that contract.
 */
describe('Integration: Compliance residency gate', () => {
  const guard = () => new ComplianceGuard(new ComplianceService());

  it('allows a money movement that is resident in CA', () => {
    expect(() =>
      guard().assertMoneyMovementAllowed({
        operation: 'PAYMENT',
        accountId: 'acct_ca',
        amountMinor: 1000n,
        currency: 'CAD',
        residencyRegion: 'CA',
      }),
    ).not.toThrow();
  });

  it('blocks a non-CA residency money movement with the residency reason', () => {
    expect(() =>
      guard().assertMoneyMovementAllowed({
        operation: 'PAYOUT',
        accountId: 'acct_us',
        amountMinor: 1000n,
        currency: 'CAD',
        residencyRegion: 'US',
      }),
    ).toThrow(/Canadian data residency only/);
  });

  it('returns a structured decision from the underlying compliance service', () => {
    const service = new ComplianceService();

    const approved = service.evaluate({
      operation: 'PAYMENT',
      accountId: 'a',
      amountMinor: 1n,
      currency: 'CAD',
      residencyRegion: 'CA',
    });
    expect(approved).toEqual({ approved: true });

    const blocked = service.evaluate({
      operation: 'CHARGEBACK',
      accountId: 'a',
      amountMinor: 1n,
      currency: 'CAD',
      residencyRegion: 'EU',
    });
    expect(blocked.approved).toBe(false);
    expect(blocked.reason).toMatch(/residency/i);
  });
});
