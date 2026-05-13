import { Module } from '@nestjs/common';
import { ECommsZoneClient } from './ecomms-zone.client';
import { EventPublisher } from './event.publisher';

@Module({
  providers: [ECommsZoneClient, EventPublisher],
  exports: [EventPublisher],
})
export class EventsModule {}
