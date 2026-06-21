import { Injectable, Logger } from '@nestjs/common';
import { ECommsZoneClient } from './ecomms-zone.client';
import { enrichFinanceEvent, FinanceEvent } from './event.types';

@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(
    private readonly eCommsZoneClient: ECommsZoneClient = new ECommsZoneClient(),
  ) {}

  /**
   * Publish a finance lifecycle event. The event is centrally enriched with
   * envelope metadata (eventId, eventVersion, source) so every downstream
   * consumer receives a stable, de-duplicatable, versioned event regardless of
   * which internal producer emitted it.
   *
   * @returns the enriched event that was forwarded (useful for testing and for
   *          callers that want the assigned eventId).
   */
  publish(event: FinanceEvent): FinanceEvent {
    const enriched = enrichFinanceEvent(event);
    this.logger.log(
      `Published ${enriched.type} for ${enriched.aggregateId} (eventId=${enriched.eventId})`,
    );
    void this.eCommsZoneClient.publishFinanceEvent(enriched);
    return enriched;
  }
}
