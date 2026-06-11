import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { FinanceEvent } from './event.types';

interface ECommsZoneEnvelope {
  contractVersion: '1.1';
  destination: 'eCommsZone';
  source: 'AccountFinanceZone';
  ruleAppliedId: 'GOVERNANCE-EQ-v1';
  event: FinanceEvent;
  deliveredAt: string;
}

@Injectable()
export class ECommsZoneClient {
  private readonly logger = new Logger(ECommsZoneClient.name);

  async publishFinanceEvent(event: FinanceEvent): Promise<void> {
    const webhookUrl = process.env.ECOMMSZONE_WEBHOOK_URL?.trim();

    if (!webhookUrl) {
      return;
    }

    const envelope: ECommsZoneEnvelope = {
      contractVersion: '1.1',
      destination: 'eCommsZone',
      source: 'AccountFinanceZone',
      ruleAppliedId: 'GOVERNANCE-EQ-v1',
      event,
      deliveredAt: new Date().toISOString(),
    };

    const body = JSON.stringify(envelope);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-oqmi-contract-version': '1.1',
      'x-oqmi-rule-applied-id': 'GOVERNANCE-EQ-v1',
      'x-oqmi-source-system': 'AccountFinanceZone',
    };

    const sharedSecret = process.env.ECOMMSZONE_WEBHOOK_SECRET?.trim();
    if (sharedSecret) {
      headers['x-oqmi-signature-sha256'] =
        `sha256=${createHmac('sha256', sharedSecret).update(body).digest('hex')}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `eCommsZone webhook returned ${response.status} for ${event.type}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to forward ${event.type} to eCommsZone: ${message}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
