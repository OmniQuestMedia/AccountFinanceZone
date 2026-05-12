import { ComplianceGuard } from '../src/compliance/compliance.guard';
import { ComplianceService } from '../src/compliance/compliance.service';
import { EventPublisher } from '../src/events/event.publisher';
import { FraudService } from '../src/fraud/fraud.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { TransactionService } from '../src/transactions/transaction.service';

describe('TransactionService', () => {
  it('blocks high-risk payments and does not mutate ledger', () => {
    const ledgerService = new LedgerService();
    const service = new TransactionService(
      new ComplianceGuard(new ComplianceService()),
      ledgerService,
      new FraudService(),
      new EventPublisher(),
    );

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
});
