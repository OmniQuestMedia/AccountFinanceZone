import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ComplianceGuard } from '../compliance/compliance.guard';
import { EventPublisher } from '../events/event.publisher';
import { FraudService } from '../fraud/fraud.service';
import { LedgerService } from '../ledger/ledger.service';
import { MoneyMovementRequest } from '../common/types';

export interface ProcessPaymentRequest extends MoneyMovementRequest {
  accountAgeDays: number;
  velocityLastHour: number;
  cardCountry?: string;
  accountCountry?: string;
}

@Injectable()
export class TransactionService {
  constructor(
    private readonly complianceGuard: ComplianceGuard,
    private readonly ledgerService: LedgerService,
    private readonly fraudService: FraudService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  processPayment(input: ProcessPaymentRequest): string {
    this.complianceGuard.assertMoneyMovementAllowed({
      operation: 'PAYMENT',
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      residencyRegion: 'CA',
    });

    const fraud = this.fraudService.assess({
      accountAgeDays: input.accountAgeDays,
      velocityLastHour: input.velocityLastHour,
      amountMinor: input.amountMinor,
      cardCountry: input.cardCountry,
      accountCountry: input.accountCountry,
    });

    if (fraud.decision === 'BLOCK') {
      this.eventPublisher.publish({
        type: 'FraudFlagRaised',
        aggregateId: input.accountId,
        payload: { fraud, source: 'TransactionService' },
        emittedAt: new Date().toISOString(),
      });
      throw new Error('Payment blocked due to fraud risk');
    }

    const transactionId = `txn_${randomUUID()}`;

    this.ledgerService.appendEntry({
      accountId: input.accountId,
      transactionId,
      entryType: 'DEBIT',
      amountMinor: input.amountMinor,
      currency: input.currency,
      context: input.context,
    });

    this.eventPublisher.publish({
      type: 'PaymentProcessed',
      aggregateId: transactionId,
      payload: {
        accountId: input.accountId,
        amountMinor: input.amountMinor.toString(),
        currency: input.currency,
        sourceEventId: input.context.sourceEventId,
      },
      emittedAt: new Date().toISOString(),
    });

    return transactionId;
  }

  initiateRefund(transactionId: string, input: MoneyMovementRequest, offsetOfEntryId: string): string {
    this.complianceGuard.assertMoneyMovementAllowed({
      operation: 'REFUND',
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      residencyRegion: 'CA',
    });

    this.ledgerService.appendEntry({
      accountId: input.accountId,
      transactionId,
      entryType: 'OFFSET',
      amountMinor: input.amountMinor,
      currency: input.currency,
      offsetOfEntryId,
      context: input.context,
    });

    this.eventPublisher.publish({
      type: 'RefundInitiated',
      aggregateId: transactionId,
      payload: { offsetOfEntryId },
      emittedAt: new Date().toISOString(),
    });

    return transactionId;
  }

  registerChargeback(transactionId: string, input: MoneyMovementRequest, offsetOfEntryId: string): string {
    this.complianceGuard.assertMoneyMovementAllowed({
      operation: 'CHARGEBACK',
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      residencyRegion: 'CA',
    });

    this.ledgerService.appendEntry({
      accountId: input.accountId,
      transactionId,
      entryType: 'OFFSET',
      amountMinor: input.amountMinor,
      currency: input.currency,
      offsetOfEntryId,
      context: input.context,
    });

    this.eventPublisher.publish({
      type: 'ChargebackRegistered',
      aggregateId: transactionId,
      payload: { offsetOfEntryId },
      emittedAt: new Date().toISOString(),
    });

    return transactionId;
  }
}
