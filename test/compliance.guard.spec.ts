import { ComplianceGuard } from '../src/compliance/compliance.guard';
import { ComplianceService } from '../src/compliance/compliance.service';

describe('ComplianceGuard', () => {
  it('enforces Canadian data residency for money movement', () => {
    const guard = new ComplianceGuard(new ComplianceService());

    expect(() =>
      guard.assertMoneyMovementAllowed({
        operation: 'PAYMENT',
        accountId: 'acct_1',
        amountMinor: 100n,
        currency: 'CAD',
        residencyRegion: 'US',
      }),
    ).toThrow('Canadian data residency only');
  });
});
