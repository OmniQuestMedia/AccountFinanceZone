import { Injectable } from '@nestjs/common';
import { ComplianceGuard } from '../compliance/compliance.guard';
import { EventPublisher } from '../events/event.publisher';
import { LedgerService } from '../ledger/ledger.service';
import { FinancialWriteContext } from '../common/types';

export interface IssuePayoutRequest {
  creatorAccountId: string;
  amountMinor: bigint;
  currency: string;
  revenueShareBps: number;
  context: FinancialWriteContext;
}

@Injectable()
export class PayoutService {
  constructor(
    private readonly complianceGuard: ComplianceGuard,
    private readonly ledgerService: LedgerService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  issuePayout(input: IssuePayoutRequest): string {
    this.complianceGuard.assertMoneyMovementAllowed({
      operation: 'PAYOUT',
      accountId: input.creatorAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      residencyRegion: 'CA',
    });

    const payoutId = `po_${Date.now()}`;

    this.ledgerService.appendEntry({
      accountId: input.creatorAccountId,
      transactionId: payoutId,
      entryType: 'CREDIT',
      amountMinor: input.amountMinor,
      currency: input.currency,
      context: input.context,
    });

    this.eventPublisher.publish({
      type: 'PayoutIssued',
      aggregateId: payoutId,
      payload: {
        creatorAccountId: input.creatorAccountId,
        revenueShareBps: input.revenueShareBps,
      },
      emittedAt: new Date().toISOString(),
    });

    return payoutId;
  }
}
