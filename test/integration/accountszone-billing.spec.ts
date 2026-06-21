import { BillingService } from '../../src/billing/billing.service';
import { ComplianceGuard } from '../../src/compliance/compliance.guard';
import { ComplianceService } from '../../src/compliance/compliance.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PayoutService } from '../../src/payouts/payout.service';
import {
  IntegrationError,
  IntegrationErrorCode,
  isIntegrationError,
} from '../../src/common/integration-error';
import { RecordingEventPublisher } from './recording-event-publisher';

/**
 * Simulates AccountsZone publishing identity/subscription events that
 * AccountFinanceZone consumes. Validates both the happy path and that
 * malformed inbound events are rejected with the typed error contract instead
 * of being silently mis-processed.
 */
describe('Integration: AccountsZone events consumed by Billing', () => {
  const build = () => {
    const payoutService = new PayoutService(
      new ComplianceGuard(new ComplianceService()),
      new LedgerService(),
      new RecordingEventPublisher(),
    );
    return new BillingService(payoutService);
  };

  it('applies a tier change and links a fan account from valid events', () => {
    const billing = build();

    billing.linkAccountToCreator({
      accountId: 'fan_az',
      creatorAccountId: 'creator_az',
      linkType: 'FAN_CLUB_SUBSCRIPTION',
      occurredAt: '2026-06-20T00:00:00.000Z',
    });
    expect(billing.getLinkedCreator('fan_az')).toBe('creator_az');

    expect(() =>
      billing.consumeSubscriptionTierChange({
        accountId: 'creator_az',
        previousTier: 'BASIC',
        newTier: 'ELITE',
        occurredAt: '2026-06-20T00:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('rejects a tier-change event missing required fields with INVALID_EVENT_PAYLOAD', () => {
    const billing = build();

    let caught: unknown;
    try {
      billing.consumeSubscriptionTierChange({
        accountId: '',
        previousTier: 'BASIC',
        newTier: '',
        occurredAt: '2026-06-20T00:00:00.000Z',
      });
    } catch (err) {
      caught = err;
    }

    expect(isIntegrationError(caught)).toBe(true);
    const error = caught as IntegrationError;
    expect(error.code).toBe(IntegrationErrorCode.INVALID_EVENT_PAYLOAD);
    expect(error.httpStatus).toBe(400);
    expect(error.retryable).toBe(false);
    expect(error.details?.missingFields).toEqual(['accountId', 'newTier']);
    // Serializes to the canonical cross-zone error envelope.
    expect(error.toJSON().error.code).toBe(
      IntegrationErrorCode.INVALID_EVENT_PAYLOAD,
    );
  });

  it('rejects a non-object account-linking payload', () => {
    const billing = build();

    expect(() =>
      billing.linkAccountToCreator(
        null as unknown as Parameters<
          BillingService['linkAccountToCreator']
        >[0],
      ),
    ).toThrow(IntegrationError);
  });
});
