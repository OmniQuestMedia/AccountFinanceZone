import { ComplianceGuard } from '../src/compliance/compliance.guard';
import { ComplianceService } from '../src/compliance/compliance.service';
import { EventPublisher } from '../src/events/event.publisher';
import { FraudService } from '../src/fraud/fraud.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { TransactionService } from '../src/transactions/transaction.service';
import { WalletService } from '../src/wallet/wallet.service';

describe('TransactionService', () => {
  const createService = (ledgerService: LedgerService): TransactionService =>
    new TransactionService(
      new ComplianceGuard(new ComplianceService()),
      ledgerService,
      new FraudService(),
      new EventPublisher(),
      new WalletService(),
    );

  it('processes low-risk payments and appends a ledger entry', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    const transactionId = service.processPayment({
      accountId: 'acct_success',
      amountMinor: 1000n,
      currency: 'CAD',
      paymentTokenId: 'tok_2',
      accountAgeDays: 120,
      velocityLastHour: 1,
      cardCountry: 'CA',
      accountCountry: 'CA',
      context: {
        ruleAppliedId: 'rule_payment_v3',
        auditTraceId: 'audit_success',
      },
    });

    expect(transactionId.startsWith('txn_')).toBe(true);
    expect(ledgerService.listEntriesForAccount('acct_success')).toHaveLength(1);
  });

  it('blocks high-risk payments and does not mutate ledger', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    expect(() =>
      service.processPayment({
        accountId: 'acct_3',
        amountMinor: 250000n,
        currency: 'CAD',
        paymentTokenId: 'tok_1',
        accountAgeDays: 1,
        velocityLastHour: 12,
        cardCountry: 'US',
        accountCountry: 'CA',
        context: {
          ruleAppliedId: 'rule_payment_v3',
          auditTraceId: 'audit_3',
        },
      }),
    ).toThrow('Payment blocked due to fraud risk');

    expect(ledgerService.listEntriesForAccount('acct_3')).toHaveLength(0);
  });

  it('rejects duplicate payment with the same idempotency key', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);
    const payload = {
      accountId: 'acct_idem',
      amountMinor: 1000n,
      currency: 'CAD',
      paymentTokenId: 'tok_idem',
      accountAgeDays: 120,
      velocityLastHour: 1,
      context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_idem', idempotencyKey: 'key_42' },
    };
    service.processPayment(payload);
    expect(() => service.processPayment(payload)).toThrow('Duplicate payment rejected');
    expect(ledgerService.listEntriesForAccount('acct_idem')).toHaveLength(1);
  });

  it('initiateRefund throws — cash refunds are prohibited', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    expect(() =>
      service.initiateRefund(
        'txn_ref_1',
        {
          accountId: 'acct_refund',
          amountMinor: 500n,
          currency: 'CAD',
          paymentTokenId: 'tok_r',
          context: { ruleAppliedId: 'rule_r', auditTraceId: 'audit_r' },
        },
        'le_1',
      ),
    ).toThrow('Cash refunds are prohibited');

    expect(ledgerService.listEntriesForAccount('acct_refund')).toHaveLength(0);
  });

  it('issueVipRefundAsCredit appends a CREDIT ledger entry to the promotional bucket', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    const result = service.issueVipRefundAsCredit(
      'acct_vip',
      2000n,
      'CAD',
      { ruleAppliedId: 'rule_vip', auditTraceId: 'audit_vip' },
      'VIP customer satisfaction credit',
    );

    expect(result.creditId.startsWith('crd_')).toBe(true);
    expect(result.bucket).toBe('promotional');
    expect(result.amountMinor).toBe(2000n);
    const entries = ledgerService.listEntriesForAccount('acct_vip');
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('CREDIT');
  });

  it('records chargeback as append-only offset entry', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    service.registerChargeback(
      'txn_ref_1',
      {
        accountId: 'acct_offsets',
        amountMinor: 900n,
        currency: 'CAD',
        paymentTokenId: 'tok_3',
        context: {
          ruleAppliedId: 'rule_chargeback_v1',
          auditTraceId: 'audit_chargeback',
        },
      },
      'le_origin_1',
    );

    const entries = ledgerService.listEntriesForAccount('acct_offsets');
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('OFFSET');
  });
});
