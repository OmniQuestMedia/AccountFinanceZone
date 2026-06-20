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

  const validInput = (overrides: Record<string, unknown> = {}) => ({
    accountId: 'acct_h',
    entryType: 'DEBIT' as const,
    amountMinor: 1000n,
    currency: 'CAD',
    context: { ruleAppliedId: 'rule_h', auditTraceId: 'audit_h' },
    ...overrides,
  });

  it('rejects non-positive amounts and malformed currency codes', () => {
    const service = new LedgerService();

    expect(() => service.appendEntry(validInput({ amountMinor: 0n }))).toThrow(
      'amountMinor must be a positive integer',
    );
    expect(() => service.appendEntry(validInput({ amountMinor: -5n }))).toThrow(
      'amountMinor must be a positive integer',
    );
    expect(() => service.appendEntry(validInput({ currency: 'cad' }))).toThrow(
      'Invalid currency code',
    );
  });

  it('rejects OFFSET entries that do not reference a real prior entry', () => {
    const service = new LedgerService();

    expect(() =>
      service.appendEntry(validInput({ entryType: 'OFFSET', offsetOfEntryId: 'le_missing' })),
    ).toThrow('OFFSET references unknown ledger entry');
  });

  it('chains entries with sha256 hashes and a genesis prevHash', () => {
    const service = new LedgerService();

    const first = service.appendEntry(validInput());
    const second = service.appendEntry(validInput({ amountMinor: 2000n }));

    expect(first.sequence).toBe(0);
    expect(first.prevHash).toBe('0'.repeat(64));
    expect(first.entryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.sequence).toBe(1);
    expect(second.prevHash).toBe(first.entryHash);
    expect(service.verifyIntegrity().valid).toBe(true);
  });

  it('freezes entries so the ledger is immutable at runtime', () => {
    const service = new LedgerService();
    const entry = service.appendEntry(validInput());

    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => {
      (entry as { amountMinor: bigint }).amountMinor = 9999n;
    }).toThrow();
  });

  it('detects tampering via verifyIntegrity', () => {
    const service = new LedgerService();
    service.appendEntry(validInput());
    service.appendEntry(validInput({ amountMinor: 2000n }));

    // Reach past the frozen public objects into the internal array and corrupt one entry.
    const internal = (service as unknown as { entries: Array<{ amountMinor: bigint }> }).entries;
    internal[0] = { ...internal[0], amountMinor: 999999n };

    const report = service.verifyIntegrity();
    expect(report.valid).toBe(false);
    expect(report.brokenAtSequence).toBe(0);
  });

  it('threads correlationId onto ledger entries', () => {
    const service = new LedgerService();
    const entry = service.appendEntry(
      validInput({ context: { ruleAppliedId: 'rule_h', auditTraceId: 'audit_h', correlationId: 'corr_99' } }),
    );

    expect(entry.correlationId).toBe('corr_99');
  });
});
