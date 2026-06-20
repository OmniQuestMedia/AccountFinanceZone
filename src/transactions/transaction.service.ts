import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FinancialWriteContext, MoneyMovementRequest } from '../common/types';
import { ComplianceGuard } from '../compliance/compliance.guard';
import { EventPublisher } from '../events/event.publisher';
import { FraudService } from '../fraud/fraud.service';
import { LedgerService } from '../ledger/ledger.service';
import { WalletService } from '../wallet/wallet.service';

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
    const idempotencyKey = input.context.idempotencyKey;
    if (idempotencyKey) {
      const scopedKey = `${input.accountId}:${idempotencyKey}`;
      if (this.seenIdempotencyKeys.has(scopedKey)) {
        throw new Error(
          `Duplicate idempotency key: ${idempotencyKey}. Transaction already processed.`,
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

  /**
   * Cash refunds are prohibited per Canonical Corpus v11.
   * Use issueVipRefundAsCredit() to re-issue value as promotional credits.
   */
  initiateRefund(
    _transactionId: string,
    _input: MoneyMovementRequest,
    _offsetOfEntryId: string,
  ): never {
    throw new Error(
      'Cash refunds are prohibited (Canonical Corpus v11). ' +
        'Use issueVipRefundAsCredit() to re-issue as promotional credits.',
    );
  }

  /**
   * VIP Refund Protocol: re-issues the refund amount as a promotional wallet credit.
   * No cash reversal. Credit lands in bucket \'promotional\' (spent first per spend order).
   */
  issueVipRefundAsCredit(params: {
    accountId: string;
    amountMinor: bigint;
    originalTransactionId: string;
    context: FinancialWriteContext;
  }): { creditId: string; bucket: 'promotional'; amountMinor: bigint } {
    const credit = this.walletService.issuePromotionalCredit({
      amountMinor: params.amountMinor,
      reason: `VIP refund for transaction ${params.originalTransactionId}`,
    });

    const entry = this.ledgerService.appendEntry({
      accountId: params.accountId,
      transactionId: params.originalTransactionId,
      entryType: 'CREDIT',
      amountMinor: credit.amountMinor,
      currency: 'CAD',
      context: params.context,
    });

    this.eventPublisher.publish({
      type: 'PromotionalCreditIssued',
      aggregateId: params.accountId,
      payload: {
        originalTransactionId: params.originalTransactionId,
        amountMinor: credit.amountMinor.toString(),
        bucket: 'promotional',
        ledgerEntryId: entry.id,
      },
      emittedAt: new Date().toISOString(),
    });

    return {
      creditId: entry.id,
      bucket: 'promotional',
      amountMinor: credit.amountMinor,
    };
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
