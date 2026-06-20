import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ComplianceGuard } from '../compliance/compliance.guard';
import { EventPublisher } from '../events/event.publisher';
import { FraudService } from '../fraud/fraud.service';
import { LedgerService } from '../ledger/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { MoneyMovementRequest } from '../common/types';

export interface ProcessPaymentRequest extends MoneyMovementRequest {
  accountAgeDays: number;
  velocityLastHour: number;
  cardCountry?: string;
  accountCountry?: string;
}

@Injectable()
export class TransactionService {
  private readonly seenIdempotencyKeys = new Set<string>();

  constructor(
    private readonly complianceGuard: ComplianceGuard,
    private readonly ledgerService: LedgerService,
    private readonly fraudService: FraudService,
    private readonly eventPublisher: EventPublisher,
    private readonly walletService: WalletService,
  ) {}

  processPayment(input: ProcessPaymentRequest): string {
    if (input.context.idempotencyKey) {
      const scopedKey = `${input.accountId}:${input.context.idempotencyKey}`;
      if (this.seenIdempotencyKeys.has(scopedKey)) {
        throw new Error(
          `Duplicate payment rejected: idempotency key '${input.context.idempotencyKey}' already processed for account '${input.accountId}'`,
        );
      }
      this.seenIdempotencyKeys.add(scopedKey);
    }

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

  // Cash refunds are prohibited by Canonical Corpus v11. Use issueVipRefundAsCredit() instead.
  initiateRefund(_transactionId: string, _input: MoneyMovementRequest, _offsetOfEntryId: string): never {
    throw new Error(
      'Cash refunds are prohibited (Canonical Corpus v11). Use issueVipRefundAsCredit() to re-issue as promotional credits.',
    );
  }

  issueVipRefundAsCredit(
    accountId: string,
    amountMinor: bigint,
    currency: string,
    context: MoneyMovementRequest['context'],
    reason: string,
  ): { creditId: string; bucket: 'promotional'; amountMinor: bigint } {
    const credit = this.walletService.issuePromotionalCredit({ amountMinor, reason });

    const creditId = `crd_${randomUUID()}`;

    this.ledgerService.appendEntry({
      accountId,
      transactionId: creditId,
      entryType: 'CREDIT',
      amountMinor,
      currency,
      context,
    });

    this.eventPublisher.publish({
      type: 'PromotionalCreditIssued',
      aggregateId: creditId,
      payload: { accountId, amountMinor: amountMinor.toString(), bucket: credit.bucket, reason },
      emittedAt: new Date().toISOString(),
    });

    return { creditId, bucket: 'promotional', amountMinor };
  }

  registerChargeback(
    transactionId: string,
    input: MoneyMovementRequest,
    offsetOfEntryId: string,
  ): string {
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
