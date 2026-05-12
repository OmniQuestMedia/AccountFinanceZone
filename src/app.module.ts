import { Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';
import { ComplianceModule } from './compliance/compliance.module';
import { EventsModule } from './events/events.module';
import { FraudModule } from './fraud/fraud.module';
import { LedgerModule } from './ledger/ledger.module';
import { PayoutsModule } from './payouts/payouts.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    TransactionsModule,
    BillingModule,
    PayoutsModule,
    LedgerModule,
    FraudModule,
    ComplianceModule,
    EventsModule,
  ],
})
export class AppModule {}
