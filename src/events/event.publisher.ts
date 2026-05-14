import { Injectable, Logger } from '@nestjs/common';
import { ECommsZoneClient } from './ecomms-zone.client';
import { FinanceEvent } from './event.types';

@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(private readonly eCommsZoneClient: ECommsZoneClient = new ECommsZoneClient()) {}

  publish(event: FinanceEvent): void {
    this.logger.log(`Published ${event.type} for ${event.aggregateId}`);
    void this.eCommsZoneClient.publishFinanceEvent(event);
  }
}
