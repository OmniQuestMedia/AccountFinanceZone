import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
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

export interface CalculateRevenueShareRequest {
  transactionAmountMinor: bigint;
  revenueShareBps: number;
}

export interface CalculateRevenueShareResult {
  creatorShareMinor: bigint;
  platformShareMinor: bigint;
  totalMinor: bigint;
}

export interface PayoutReconciliationRecord {
  payoutId: string;
  creatorAccountId: string;
  amountMinor: bigint;
  currency: string;
  revenueShareBps: number;
  status: 'PENDING' | 'SETTLED' | 'FAILED';
  ledgerEntryId: string;
  createdAt: string;
  settledAt?: string;
}

@Injectable()
export class PayoutService {
  private readonly reconciliationRecords: PayoutReconciliationRecord[] = [];

  constructor(
    private readonly complianceGuard: ComplianceGuard,
    private readonly ledgerService: LedgerService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  /**
   * Calculate revenue share between creator and platform based on basis points (BPS).
   * BPS are in hundredths of a percent (e.g., 2500 BPS = 25%).
   *
   * @param request - Transaction amount and revenue share percentage
   * @returns Breakdown of creator share, platform share, and total
   * @throws Error if revenueShareBps is invalid (< 0 or > 10000)
   */
  calculateRevenueShare(request: CalculateRevenueShareRequest): CalculateRevenueShareResult {
    if (request.revenueShareBps < 0 || request.revenueShareBps > 10000) {
      throw new Error('revenueShareBps must be between 0 and 10000 (0-100%)');
    }

    // Calculate creator share: amount * (bps / 10000)
    // Use BigInt arithmetic to avoid floating point precision issues
    const creatorShareMinor = (request.transactionAmountMinor * BigInt(request.revenueShareBps)) / 10000n;

    // Platform gets the remainder to ensure no rounding discrepancies
    const platformShareMinor = request.transactionAmountMinor - creatorShareMinor;

    return {
      creatorShareMinor,
      platformShareMinor,
      totalMinor: request.transactionAmountMinor,
    };
  }

  /**
   * Issue a payout to a creator with revenue share tracking.
   * Creates a ledger entry and reconciliation record for audit trail.
   */
  issuePayout(input: IssuePayoutRequest): string {
    this.complianceGuard.assertMoneyMovementAllowed({
      operation: 'PAYOUT',
      accountId: input.creatorAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      residencyRegion: 'CA',
    });

    const payoutId = `po_${randomUUID()}`;

    const ledgerEntry = this.ledgerService.appendEntry({
      accountId: input.creatorAccountId,
      transactionId: payoutId,
      entryType: 'CREDIT',
      amountMinor: input.amountMinor,
      currency: input.currency,
      context: input.context,
    });

    // Create reconciliation record for tracking settlement
    const reconciliationRecord: PayoutReconciliationRecord = {
      payoutId,
      creatorAccountId: input.creatorAccountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      revenueShareBps: input.revenueShareBps,
      status: 'PENDING',
      ledgerEntryId: ledgerEntry.id,
      createdAt: new Date().toISOString(),
    };

    this.reconciliationRecords.push(reconciliationRecord);

    this.eventPublisher.publish({
      type: 'PayoutIssued',
      aggregateId: payoutId,
      payload: {
        creatorAccountId: input.creatorAccountId,
        amountMinor: input.amountMinor.toString(),
        revenueShareBps: input.revenueShareBps,
        ledgerEntryId: ledgerEntry.id,
      },
      emittedAt: new Date().toISOString(),
    });

    return payoutId;
  }

  /**
   * Mark a payout as settled in the reconciliation system.
   * This is used to track when payouts have been successfully processed.
   */
  settlePayout(payoutId: string): void {
    const record = this.reconciliationRecords.find((r) => r.payoutId === payoutId);

    if (!record) {
      throw new Error(`Payout ${payoutId} not found in reconciliation records`);
    }

    if (record.status === 'SETTLED') {
      throw new Error(`Payout ${payoutId} is already settled`);
    }

    record.status = 'SETTLED';
    record.settledAt = new Date().toISOString();

    this.eventPublisher.publish({
      type: 'PayoutSettled',
      aggregateId: payoutId,
      payload: {
        creatorAccountId: record.creatorAccountId,
        amountMinor: record.amountMinor.toString(),
        settledAt: record.settledAt,
      },
      emittedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark a payout as failed in the reconciliation system.
   * This is used to track when payouts could not be processed.
   */
  failPayout(payoutId: string, reason: string): void {
    const record = this.reconciliationRecords.find((r) => r.payoutId === payoutId);

    if (!record) {
      throw new Error(`Payout ${payoutId} not found in reconciliation records`);
    }

    if (record.status !== 'PENDING') {
      throw new Error(`Payout ${payoutId} is not in PENDING status`);
    }

    record.status = 'FAILED';

    this.eventPublisher.publish({
      type: 'PayoutFailed',
      aggregateId: payoutId,
      payload: {
        creatorAccountId: record.creatorAccountId,
        reason,
      },
      emittedAt: new Date().toISOString(),
    });
  }

  /**
   * Get all reconciliation records for a specific creator account.
   * Useful for auditing and reporting.
   */
  getReconciliationRecordsForCreator(creatorAccountId: string): PayoutReconciliationRecord[] {
    return this.reconciliationRecords.filter((r) => r.creatorAccountId === creatorAccountId);
  }

  /**
   * Get all pending payouts that need to be settled.
   */
  getPendingPayouts(): PayoutReconciliationRecord[] {
    return this.reconciliationRecords.filter((r) => r.status === 'PENDING');
  }
}
