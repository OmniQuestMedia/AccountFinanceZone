import { LedgerService } from '../src/ledger/ledger.service';

describe('LedgerService', () => {
  it('requires rule_applied_id for financial writes', () => {
    const service = new LedgerService();

    expect(() =>
      service.appendEntry({
        accountId: 'acct_1',
        entryType: 'DEBIT',
        amountMinor: 1000n,
        currency: 'CAD',
        context: {
          ruleAppliedId: '',
          auditTraceId: 'audit_1',
        },
      }),
    ).toThrow('ruleAppliedId is required');
  });

  it('creates append-only entries for valid writes', () => {
    const service = new LedgerService();

    const entry = service.appendEntry({
      accountId: 'acct_2',
      transactionId: 'txn_1',
      entryType: 'DEBIT',
      amountMinor: 5000n,
      currency: 'CAD',
      context: {
        ruleAppliedId: 'rule_payout_v2',
        auditTraceId: 'audit_2',
      },
    });

    expect(entry.ruleAppliedId).toBe('rule_payout_v2');
    expect(service.listEntriesForAccount('acct_2')).toHaveLength(1);
  });
});
