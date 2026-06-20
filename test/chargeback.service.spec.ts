import { ChargebackService } from '../src/compliance/chargeback.service';

describe('ChargebackService — dispute package assembler', () => {
  let service: ChargebackService;

  beforeEach(() => {
    service = new ChargebackService();
  });

  it('assembles an immutable package with OPEN status', () => {
    const pkg = service.assemble({
      transactionId: 'txn_1',
      accountId: 'acct_1',
      amountMinor: 5000n,
      currency: 'CAD',
      ledgerEntryIds: ['le_1', 'le_2'],
      gateguardAuthToken: 'gg_tok_abc',
      ecommsReceiptId: 'receipt_xyz',
    });

    expect(pkg.id.startsWith('cbk_')).toBe(true);
    expect(pkg.status).toBe('OPEN');
    expect(pkg.evidence.ledgerEntryIds).toEqual(['le_1', 'le_2']);
    expect(pkg.evidence.gateguardAuthToken).toBe('gg_tok_abc');
    expect(pkg.evidence.ecommsReceiptId).toBe('receipt_xyz');
  });

  it('allows OPEN -> EVIDENCE_SUBMITTED transition', () => {
    const pkg = service.assemble({
      transactionId: 'txn_2',
      accountId: 'acct_2',
      amountMinor: 1000n,
      currency: 'CAD',
      ledgerEntryIds: ['le_3'],
    });
    const updated = service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    expect(updated.status).toBe('EVIDENCE_SUBMITTED');
  });

  it('allows EVIDENCE_SUBMITTED -> RESOLVED_WON transition', () => {
    const pkg = service.assemble({
      transactionId: 'txn_3',
      accountId: 'acct_3',
      amountMinor: 2000n,
      currency: 'CAD',
      ledgerEntryIds: ['le_4'],
    });
    service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    const resolved = service.transition(pkg.id, 'RESOLVED_WON');
    expect(resolved.status).toBe('RESOLVED_WON');
  });

  it('allows EVIDENCE_SUBMITTED -> RESOLVED_LOST transition', () => {
    const pkg = service.assemble({
      transactionId: 'txn_3b',
      accountId: 'acct_3b',
      amountMinor: 1500n,
      currency: 'CAD',
      ledgerEntryIds: ['le_4b'],
    });
    service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    const resolved = service.transition(pkg.id, 'RESOLVED_LOST');
    expect(resolved.status).toBe('RESOLVED_LOST');
  });

  it('blocks invalid transition OPEN -> RESOLVED_WON', () => {
    const pkg = service.assemble({
      transactionId: 'txn_4',
      accountId: 'acct_4',
      amountMinor: 3000n,
      currency: 'CAD',
      ledgerEntryIds: ['le_5'],
    });
    expect(() => service.transition(pkg.id, 'RESOLVED_WON')).toThrow(
      'Invalid status transition',
    );
  });

  it('blocks any transition from terminal RESOLVED statuses', () => {
    const pkg = service.assemble({
      transactionId: 'txn_5',
      accountId: 'acct_5',
      amountMinor: 500n,
      currency: 'CAD',
      ledgerEntryIds: ['le_6'],
    });
    service.transition(pkg.id, 'EVIDENCE_SUBMITTED');
    service.transition(pkg.id, 'RESOLVED_LOST');
    expect(() =>
      service.transition(pkg.id, 'EVIDENCE_SUBMITTED'),
    ).toThrow('Invalid status transition');
  });

  it('throws when package not found', () => {
    expect(() =>
      service.transition('cbk_nonexistent', 'EVIDENCE_SUBMITTED'),
    ).toThrow('Chargeback package not found');
  });
});
