import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { TheatrePayoutService } from './theatre-payout.service';
import { TheatreController } from './theatre.controller';

@Module({
  imports: [PrismaModule, LedgerModule, EventsModule, ComplianceModule],
  controllers: [TheatreController],
  providers: [TheatrePayoutService],
  exports: [TheatrePayoutService],
})
export class TheatreModule {}
