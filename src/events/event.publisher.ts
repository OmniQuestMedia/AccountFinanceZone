import { Injectable, Logger } from '@nestjs/common';
import { FinanceEvent } from './event.types';

@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  publish(event: FinanceEvent): void {
    this.logger.log(`Published ${event.type} for ${event.aggregateId}`);
  }
}
