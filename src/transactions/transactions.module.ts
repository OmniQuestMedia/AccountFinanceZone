import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { EventsModule } from '../events/events.module';
import { FraudModule } from '../fraud/fraud.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TransactionService } from './transaction.service';

@Module({
  imports: [ComplianceModule, LedgerModule, FraudModule, EventsModule],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionsModule {}
