import { createHmac } from 'crypto';
import { ECommsZoneClient } from '../src/events/ecomms-zone.client';

describe('ECommsZoneClient', () => {
  const originalWebhookUrl = process.env.ECOMMSZONE_WEBHOOK_URL;
  const originalWebhookSecret = process.env.ECOMMSZONE_WEBHOOK_SECRET;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalWebhookUrl === undefined) {
      delete process.env.ECOMMSZONE_WEBHOOK_URL;
    } else {
      process.env.ECOMMSZONE_WEBHOOK_URL = originalWebhookUrl;
    }

    if (originalWebhookSecret === undefined) {
      delete process.env.ECOMMSZONE_WEBHOOK_SECRET;
    } else {
      process.env.ECOMMSZONE_WEBHOOK_SECRET = originalWebhookSecret;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not call eCommsZone when no webhook URL is configured', async () => {
    delete process.env.ECOMMSZONE_WEBHOOK_URL;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;

    const client = new ECommsZoneClient();

    await client.publishFinanceEvent({
      type: 'PaymentProcessed',
      aggregateId: 'txn_1',
      payload: { accountId: 'acct_1' },
      emittedAt: '2026-05-13T00:00:00.000Z',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a v1.1 envelope with governance headers', async () => {
    process.env.ECOMMSZONE_WEBHOOK_URL = 'https://example.com/ecomms';
    process.env.ECOMMSZONE_WEBHOOK_SECRET = 'shared-secret';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
    });
    global.fetch = fetchMock as typeof fetch;

    const client = new ECommsZoneClient();
    const event = {
      type: 'RefundInitiated' as const,
      aggregateId: 'txn_2',
      payload: { offsetOfEntryId: 'le_1' },
      emittedAt: '2026-05-13T00:00:00.000Z',
    };

    await client.publishFinanceEvent(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/ecomms');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(
      expect.objectContaining({
        'content-type': 'application/json',
        'x-oqmi-contract-version': '1.1',
        'x-oqmi-rule-applied-id': 'GOVERNANCE-EQ-v1',
        'x-oqmi-source-system': 'AccountFinanceZone',
      }),
    );

    const body = String(request.body);
    const parsed = JSON.parse(body) as {
      contractVersion: string;
      destination: string;
      source: string;
      ruleAppliedId: string;
      event: { type: string };
    };

    expect(parsed.contractVersion).toBe('1.1');
    expect(parsed.destination).toBe('eCommsZone');
    expect(parsed.source).toBe('AccountFinanceZone');
    expect(parsed.ruleAppliedId).toBe('GOVERNANCE-EQ-v1');
    expect(parsed.event.type).toBe('RefundInitiated');
    expect(
      (request.headers as Record<string, string>)['x-oqmi-signature-sha256'],
    ).toBe(
      `sha256=${createHmac('sha256', 'shared-secret').update(body).digest('hex')}`,
    );
  });
});
