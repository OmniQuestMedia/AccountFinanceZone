import { ComplianceGuard } from '../../src/compliance/compliance.guard';
import { ComplianceService } from '../../src/compliance/compliance.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PayoutService } from '../../src/payouts/payout.service';
import { FinanceEvent } from '../../src/events/event.types';
import { RecordingEventPublisher } from './recording-event-publisher';

/**
 * Simulates the Rewards zone consuming AccountFinanceZone events over an
 * at-least-once webhook. Rewards awards loyalty points when creators are paid,
 * and MUST de-duplicate using the contract's `eventId` so a redelivered event
 * does not double-credit points.
 */
class RewardsConsumer {
  private readonly processedEventIds = new Set<string>();
  readonly pointsByCreator = new Map<string, number>();

  /** @returns true if the event was processed, false if skipped as a duplicate. */
  handle(event: FinanceEvent): boolean {
    const eventId = event.eventId;
    if (!eventId) {
      throw new Error('Rewards requires eventId for idempotent processing');
    }
    if (this.processedEventIds.has(eventId)) {
      return false; // already processed — at-least-once delivery dedupe
    }
    this.processedEventIds.add(eventId);

    if (event.type === 'PayoutIssued') {
      const { creatorAccountId, amountMinor } = event.payload as {
        creatorAccountId: string;
        amountMinor: string;
      };
      // 1 loyalty point per dollar paid out.
      const points = Math.floor(Number(BigInt(amountMinor)) / 100);
      this.pointsByCreator.set(
        creatorAccountId,
        (this.pointsByCreator.get(creatorAccountId) ?? 0) + points,
      );
    }
    return true;
  }
}

describe('Integration: Rewards zone consumes payout events', () => {
  const buildPayoutService = (publisher: RecordingEventPublisher) =>
    new PayoutService(
      new ComplianceGuard(new ComplianceService()),
      new LedgerService(),
      publisher,
    );

  it('awards loyalty points from a PayoutIssued event', () => {
    const publisher = new RecordingEventPublisher();
    const payoutService = buildPayoutService(publisher);
    const rewards = new RewardsConsumer();

    payoutService.issuePayout({
      creatorAccountId: 'creator_rewards',
      amountMinor: 10000n, // $100.00
      currency: 'CAD',
      revenueShareBps: 5000,
      context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_rw' },
    });

    publisher.capturedOfType('PayoutIssued').forEach((e) => rewards.handle(e));

    expect(rewards.pointsByCreator.get('creator_rewards')).toBe(100);
  });

  it('is idempotent when the same event is redelivered (at-least-once)', () => {
    const publisher = new RecordingEventPublisher();
    const payoutService = buildPayoutService(publisher);
    const rewards = new RewardsConsumer();

    payoutService.issuePayout({
      creatorAccountId: 'creator_dupe',
      amountMinor: 10000n,
      currency: 'CAD',
      revenueShareBps: 5000,
      context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_dupe' },
    });

    const event = publisher.capturedOfType('PayoutIssued')[0];

    const first = rewards.handle(event);
    const second = rewards.handle(event); // redelivery of identical event

    expect(first).toBe(true);
    expect(second).toBe(false);
    // Points credited exactly once despite two deliveries.
    expect(rewards.pointsByCreator.get('creator_dupe')).toBe(100);
  });

  it('processes distinct payouts independently (distinct eventIds)', () => {
    const publisher = new RecordingEventPublisher();
    const payoutService = buildPayoutService(publisher);
    const rewards = new RewardsConsumer();
    const ctx = { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_multi' };

    payoutService.issuePayout({
      creatorAccountId: 'creator_multi',
      amountMinor: 10000n,
      currency: 'CAD',
      revenueShareBps: 5000,
      context: ctx,
    });
    payoutService.issuePayout({
      creatorAccountId: 'creator_multi',
      amountMinor: 5000n,
      currency: 'CAD',
      revenueShareBps: 5000,
      context: ctx,
    });

    publisher.capturedOfType('PayoutIssued').forEach((e) => rewards.handle(e));

    expect(rewards.pointsByCreator.get('creator_multi')).toBe(150);
  });
});
