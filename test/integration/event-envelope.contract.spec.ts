import { createHmac } from 'crypto';
import { ECommsZoneClient } from '../../src/events/ecomms-zone.client';
import {
  EVENT_CONTRACT_VERSION,
  EVENT_SOURCE,
} from '../../src/events/event.types';
import { ComplianceGuard } from '../../src/compliance/compliance.guard';
import { ComplianceService } from '../../src/compliance/compliance.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PayoutService } from '../../src/payouts/payout.service';
import { RecordingEventPublisher } from './recording-event-publisher';

/**
 * Contract every consumer zone (Rewards, Marketplace, OKIB, Compliance) relies
 * on: every published finance event carries a stable, versioned, attributable
 * envelope, and the webhook delivery exposes a dedupe key both as a header and
 * in the body.
 */
describe('Integration: published event envelope contract', () => {
  it('stamps eventId, eventVersion and source on every emitted event', () => {
    const publisher = new RecordingEventPublisher();
    const payoutService = new PayoutService(
      new ComplianceGuard(new ComplianceService()),
      new LedgerService(),
      publisher,
    );

    payoutService.issuePayout({
      creatorAccountId: 'creator_envelope',
      amountMinor: 5000n,
      currency: 'CAD',
      revenueShareBps: 5000,
      context: { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_env' },
    });

    expect(publisher.captured).toHaveLength(1);
    const event = publisher.captured[0];
    expect(event.type).toBe('PayoutIssued');
    expect(event.eventId).toMatch(/^evt_/);
    expect(event.eventVersion).toBe(EVENT_CONTRACT_VERSION);
    expect(event.source).toBe(EVENT_SOURCE);
    expect(typeof event.emittedAt).toBe('string');
  });

  it('assigns a distinct eventId to each event instance', () => {
    const publisher = new RecordingEventPublisher();
    const payoutService = new PayoutService(
      new ComplianceGuard(new ComplianceService()),
      new LedgerService(),
      publisher,
    );

    const ctx = { ruleAppliedId: 'rule_v1', auditTraceId: 'audit_env' };
    payoutService.issuePayout({
      creatorAccountId: 'c1',
      amountMinor: 5000n,
      currency: 'CAD',
      revenueShareBps: 5000,
      context: ctx,
    });
    payoutService.issuePayout({
      creatorAccountId: 'c2',
      amountMinor: 6000n,
      currency: 'CAD',
      revenueShareBps: 5000,
      context: ctx,
    });

    const ids = publisher.captured.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('delivers the dedupe key as both x-oqmi-event-id header and body field', async () => {
    process.env.ECOMMSZONE_WEBHOOK_URL = 'https://example.com/ecomms';
    process.env.ECOMMSZONE_WEBHOOK_SECRET = 'shared-secret';
    const originalFetch = global.fetch;

    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    global.fetch = fetchMock as typeof fetch;

    try {
      const client = new ECommsZoneClient();
      await client.publishFinanceEvent({
        type: 'PayoutSettled',
        aggregateId: 'po_1',
        payload: { creatorAccountId: 'c1' },
        emittedAt: '2026-06-20T00:00:00.000Z',
      });

      const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = request.headers as Record<string, string>;
      const body = String(request.body);
      const parsed = JSON.parse(body) as {
        eventId: string;
        event: { eventId: string };
      };

      // Header and both envelope/event ids agree → consumers can dedupe on any.
      expect(headers['x-oqmi-event-id']).toMatch(/^evt_/);
      expect(parsed.eventId).toBe(headers['x-oqmi-event-id']);
      expect(parsed.event.eventId).toBe(parsed.eventId);

      // Signature still covers the full (now eventId-bearing) body.
      expect(headers['x-oqmi-signature-sha256']).toBe(
        `sha256=${createHmac('sha256', 'shared-secret').update(body).digest('hex')}`,
      );
    } finally {
      global.fetch = originalFetch;
      delete process.env.ECOMMSZONE_WEBHOOK_URL;
      delete process.env.ECOMMSZONE_WEBHOOK_SECRET;
      jest.restoreAllMocks();
    }
  });
});
