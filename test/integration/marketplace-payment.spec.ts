import { ComplianceGuard } from '../../src/compliance/compliance.guard';
import { ComplianceService } from '../../src/compliance/compliance.service';
import { FraudService } from '../../src/fraud/fraud.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { WalletService } from '../../src/wallet/wallet.service';
import {
  ProcessPaymentRequest,
  TransactionService,
} from '../../src/transactions/transaction.service';
import { RecordingEventPublisher } from './recording-event-publisher';

/**
 * Simulates the Marketplace zone driving a checkout through AccountFinanceZone:
 * one money-movement entry point, an append-only ledger write, a published
 * PaymentProcessed event for downstream consumers, and idempotent replay
 * protection on retried requests.
 */
describe('Integration: Marketplace checkout → payment processing', () => {
  const build = () => {
    const publisher = new RecordingEventPublisher();
    const ledger = new LedgerService();
    const service = new TransactionService(
      new ComplianceGuard(new ComplianceService()),
      ledger,
      new FraudService(),
      publisher,
      new WalletService(),
    );
    return { publisher, ledger, service };
  };

  const baseRequest = (
    overrides: Partial<ProcessPaymentRequest> = {},
  ): ProcessPaymentRequest => ({
    accountId: 'mkt_buyer',
    amountMinor: 2500n,
    currency: 'CAD',
    paymentTokenId: 'tok_mkt',
    accountAgeDays: 200,
    velocityLastHour: 1,
    cardCountry: 'CA',
    accountCountry: 'CA',
    context: {
      ruleAppliedId: 'rule_payment_v3',
      auditTraceId: 'audit_mkt',
      sourceEventId: 'mkt_order_1',
      idempotencyKey: 'mkt_idem_1',
    },
    ...overrides,
  });

  it('processes a payment, appends one ledger entry, and emits PaymentProcessed', () => {
    const { publisher, ledger, service } = build();

    const txnId = service.processPayment(baseRequest());

    expect(txnId).toMatch(/^txn_/);
    expect(ledger.listEntriesForAccount('mkt_buyer')).toHaveLength(1);

    const emitted = publisher.capturedOfType('PaymentProcessed');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].aggregateId).toBe(txnId);
    // sourceEventId is propagated so consumers can correlate to the order.
    expect(emitted[0].payload).toMatchObject({
      accountId: 'mkt_buyer',
      amountMinor: '2500',
      currency: 'CAD',
      sourceEventId: 'mkt_order_1',
    });
    expect(emitted[0].eventId).toMatch(/^evt_/);
  });

  it('rejects a replayed request carrying the same idempotency key', () => {
    const { ledger, service } = build();
    const req = baseRequest();

    service.processPayment(req);

    expect(() => service.processPayment(req)).toThrow(
      /Duplicate payment rejected/,
    );
    // No second ledger entry written on the duplicate.
    expect(ledger.listEntriesForAccount('mkt_buyer')).toHaveLength(1);
  });

  it('blocks a high-risk payment, emits FraudFlagRaised, and writes no ledger entry', () => {
    const { publisher, ledger, service } = build();

    expect(() =>
      service.processPayment(
        baseRequest({
          accountId: 'mkt_fraud',
          amountMinor: 500000n,
          accountAgeDays: 0,
          velocityLastHour: 20,
          cardCountry: 'US',
          accountCountry: 'CA',
          context: {
            ruleAppliedId: 'rule_payment_v3',
            auditTraceId: 'audit_fraud',
            idempotencyKey: 'mkt_idem_fraud',
          },
        }),
      ),
    ).toThrow(/fraud risk/);

    expect(ledger.listEntriesForAccount('mkt_fraud')).toHaveLength(0);
    expect(publisher.capturedOfType('FraudFlagRaised')).toHaveLength(1);
    expect(publisher.capturedOfType('PaymentProcessed')).toHaveLength(0);
  });
});
