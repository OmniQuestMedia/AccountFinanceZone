import { Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';
import { ComplianceModule } from './compliance/compliance.module';
import { EventsModule } from './events/events.module';
import { FraudModule } from './fraud/fraud.module';
import { KmsModule } from './kms/kms.module';
import { LedgerModule } from './ledger/ledger.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PrismaModule } from './prisma/prisma.module';
import { TheatreModule } from './theatre/theatre.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    KmsModule,
    PrismaModule,
    TransactionsModule,
    BillingModule,
    PayoutsModule,
    LedgerModule,
    FraudModule,
    ComplianceModule,
    EventsModule,
    TheatreModule,
  ],
})
export class AppModule {}
