import { ChargebackService } from '../src/compliance/chargeback.service';

describe('ChargebackService', () => {
  let service: ChargebackService;

  beforeEach(() => {
    service = new ChargebackService();
  });

  it('assembles a chargeback package with correct fields', () => {
    const pkg = service.assemble({
      transactionId: 'txn_abc',
      accountId: 'acct_1',
      amountMinor: 5000n,
      currency: 'CAD',
      initialEvidence: { description: 'Customer dispute', submittedAt: '2024-01-01T00:00:00Z' },
    });
    expect(pkg.id.startsWith('cbk_')).toBe(true);
    expect(pkg.status).toBe('OPEN');
    expect(pkg.transactionId).toBe('txn_abc');
    expect(pkg.evidence).toHaveLength(1);
  });

  it('transitions OPEN → EVIDENCE_SUBMITTED', () => {
    const pkg = service.assemble({ transactionId: 'txn_1', accountId: 'acct_1', amountMinor: 1000n, currency: 'CAD' });
    const updated = service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    expect(updated.status).toBe('EVIDENCE_SUBMITTED');
  });

  it('transitions EVIDENCE_SUBMITTED → RESOLVED_WON', () => {
    const pkg = service.assemble({ transactionId: 'txn_2', accountId: 'acct_1', amountMinor: 1000n, currency: 'CAD' });
    service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    const resolved = service.transition(pkg.id, 'RESOLVED_WON');
    expect(resolved.status).toBe('RESOLVED_WON');
  });

  it('transitions EVIDENCE_SUBMITTED → RESOLVED_LOST', () => {
    const pkg = service.assemble({ transactionId: 'txn_3', accountId: 'acct_1', amountMinor: 1000n, currency: 'CAD' });
    service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    const resolved = service.transition(pkg.id, 'RESOLVED_LOST');
    expect(resolved.status).toBe('RESOLVED_LOST');
  });

  it('rejects invalid transition OPEN → RESOLVED_WON', () => {
    const pkg = service.assemble({ transactionId: 'txn_4', accountId: 'acct_1', amountMinor: 1000n, currency: 'CAD' });
    expect(() => service.transition(pkg.id, 'RESOLVED_WON')).toThrow('Invalid chargeback transition');
  });

  it('blocks transitions from terminal states', () => {
    const pkg = service.assemble({ transactionId: 'txn_5', accountId: 'acct_1', amountMinor: 1000n, currency: 'CAD' });
    service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    service.transition(pkg.id, 'RESOLVED_WON');
    expect(() => service.transition(pkg.id, 'EVIDENCE_SUBMITTED')).toThrow('Invalid chargeback transition');
  });

  it('throws when package is not found', () => {
    expect(() => service.transition('cbk_nonexistent', 'EVIDENCE_SUBMITTED')).toThrow(
      'Chargeback package not found: cbk_nonexistent',
    );
  });
});
