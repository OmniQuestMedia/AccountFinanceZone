import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { EventsModule } from '../events/events.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayoutService } from './payout.service';

@Module({
  imports: [ComplianceModule, LedgerModule, EventsModule],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutsModule {}
