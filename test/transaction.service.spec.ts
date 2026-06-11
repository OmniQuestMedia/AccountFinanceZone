import { ComplianceGuard } from '../src/compliance/compliance.guard';
import { ComplianceService } from '../src/compliance/compliance.service';
import { EventPublisher } from '../src/events/event.publisher';
import { FraudService } from '../src/fraud/fraud.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { TransactionService } from '../src/transactions/transaction.service';

describe('TransactionService', () => {
  const createService = (ledgerService: LedgerService): TransactionService =>
    new TransactionService(
      new ComplianceGuard(new ComplianceService()),
      ledgerService,
      new FraudService(),
      new EventPublisher(),
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

  it('records refund and chargeback as append-only offset entries', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    service.initiateRefund(
      'txn_ref_1',
      {
        accountId: 'acct_offsets',
        amountMinor: 900n,
        currency: 'CAD',
        paymentTokenId: 'tok_3',
        context: {
          ruleAppliedId: 'rule_refund_v1',
          auditTraceId: 'audit_refund',
        },
      },
      'le_origin_1',
    );

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
    expect(entries).toHaveLength(2);
    expect(entries[0].entryType).toBe('OFFSET');
    expect(entries[1].entryType).toBe('OFFSET');
  });
});
