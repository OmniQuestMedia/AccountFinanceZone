import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { EventsModule } from '../events/events.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from '../common/encryption.service';
import { PayoutService } from './payout.service';
import { CreatorPayoutPreferenceService } from './creator-payout-preference.service';
import { PayoutRequestService } from './payout-request.service';
import { PayoutSettlementService } from './payout-settlement.service';
import { PayoutsController } from './payouts.controller';

@Module({
  imports: [ComplianceModule, LedgerModule, EventsModule, PrismaModule],
  controllers: [PayoutsController],
  providers: [
    EncryptionService,
    PayoutService,
    CreatorPayoutPreferenceService,
    PayoutRequestService,
    PayoutSettlementService,
  ],
  exports: [
    PayoutService,
    CreatorPayoutPreferenceService,
    PayoutRequestService,
    PayoutSettlementService,
  ],
})
export class PayoutsModule {}
