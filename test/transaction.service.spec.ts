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

  it('blocks duplicate idempotency keys to prevent double-spend', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);
    const baseInput = {
      accountId: 'acct_idem',
      amountMinor: 500n,
      currency: 'CAD',
      paymentTokenId: 'tok_idem',
      accountAgeDays: 30,
      velocityLastHour: 1,
      context: {
        ruleAppliedId: 'rule_payment_v3',
        auditTraceId: 'audit_idem',
        idempotencyKey: 'order_abc_123',
      },
    };

    service.processPayment(baseInput);
    expect(() => service.processPayment(baseInput)).toThrow(
      'Duplicate idempotency key',
    );
    expect(ledgerService.listEntriesForAccount('acct_idem')).toHaveLength(1);
  });

  it('prohibits cash refunds — initiateRefund() throws', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    expect(() =>
      service.initiateRefund(
        'txn_ref_1',
        {
          accountId: 'acct_refund',
          amountMinor: 900n,
          currency: 'CAD',
          paymentTokenId: 'tok_3',
          context: {
            ruleAppliedId: 'rule_refund_v1',
            auditTraceId: 'audit_refund',
          },
        },
        'le_origin_1',
      ),
    ).toThrow('Cash refunds are prohibited');

    expect(ledgerService.listEntriesForAccount('acct_refund')).toHaveLength(0);
  });

  it('issues VIP refund as promotional credit (append-only CREDIT entry)', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    const result = service.issueVipRefundAsCredit({
      accountId: 'acct_vip',
      amountMinor: 500n,
      originalTransactionId: 'txn_orig_1',
      context: {
        ruleAppliedId: 'rule_vip_refund_v1',
        auditTraceId: 'audit_vip',
      },
    });

    expect(result.bucket).toBe('promotional');
    expect(result.amountMinor).toBe(500n);
    expect(result.creditId.startsWith('le_')).toBe(true);

    const entries = ledgerService.listEntriesForAccount('acct_vip');
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('CREDIT');
  });

  it('registers chargebacks as append-only OFFSET entries', () => {
    const ledgerService = new LedgerService();
    const service = createService(ledgerService);

    service.registerChargeback(
      'txn_cbk_1',
      {
        accountId: 'acct_chargeback',
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

    const entries = ledgerService.listEntriesForAccount('acct_chargeback');
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('OFFSET');
  });
});
