import { EventPublisher } from '../../src/events/event.publisher';
import { ECommsZoneClient } from '../../src/events/ecomms-zone.client';
import { FinanceEvent } from '../../src/events/event.types';

/**
 * Test double that behaves exactly like the production {@link EventPublisher}
 * (it performs the same central envelope enrichment) but also records every
 * enriched event it emits. This lets integration tests act as a downstream
 * consumer zone and assert on the precise event contract those zones receive.
 */
export class RecordingEventPublisher extends EventPublisher {
  readonly captured: FinanceEvent[] = [];

  constructor() {
    // No webhook URL is configured in tests, so the client never makes a
    // network call — it just no-ops, exactly as in an unconfigured environment.
    super(new ECommsZoneClient());
  }

  publish(event: FinanceEvent): FinanceEvent {
    const enriched = super.publish(event);
    this.captured.push(enriched);
    return enriched;
  }

  capturedOfType(type: FinanceEvent['type']): FinanceEvent[] {
    return this.captured.filter((e) => e.type === type);
  }
}
