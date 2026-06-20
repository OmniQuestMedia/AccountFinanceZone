import { Injectable } from '@nestjs/common';

export type WalletBucket = 'promotional' | 'rewards' | 'cash';

export interface WalletBalance {
  promotional: bigint;
  rewards: bigint;
  cash: bigint;
}

export interface BucketDebit {
  bucket: WalletBucket;
  amountMinor: bigint;
}

export interface DebitAllocation {
  bucketDebits: BucketDebit[];
  totalDebited: bigint;
}

export interface PromotionalCredit {
  amountMinor: bigint;
  bucket: 'promotional';
  reason: string;
}

const SPEND_ORDER: readonly WalletBucket[] = [
  'promotional',
  'rewards',
  'cash',
] as const;

@Injectable()
export class WalletService {
  /**
   * Computes bucket-level debit allocations using enforced spend order:
   * promotional -> rewards -> cash. Out-of-order debit is rejected.
   */
  computeDebitAllocation(
    balance: WalletBalance,
    amountMinor: bigint,
  ): DebitAllocation {
    if (amountMinor <= 0n) {
      throw new Error('Debit amount must be positive');
    }

    const total = balance.promotional + balance.rewards + balance.cash;
    if (total < amountMinor) {
      throw new Error(
        `Insufficient wallet balance: have ${total}, need ${amountMinor}`,
      );
    }

    const bucketDebits: BucketDebit[] = [];
    let remaining = amountMinor;

    for (const bucket of SPEND_ORDER) {
      if (remaining === 0n) break;
      const available = balance[bucket];
      if (available <= 0n) continue;
      const debit = available >= remaining ? remaining : available;
      bucketDebits.push({ bucket, amountMinor: debit });
      remaining -= debit;
    }

    return { bucketDebits, totalDebited: amountMinor };
  }

  /**
   * VIP Refund Protocol: issues a promotional credit instead of a cash reversal.
   * Cash refunds are prohibited per Canonical Corpus v11.
   */
  issuePromotionalCredit(params: {
    amountMinor: bigint;
    reason: string;
  }): PromotionalCredit {
    if (params.amountMinor <= 0n) {
      throw new Error('Credit amount must be positive');
    }
    return {
      amountMinor: params.amountMinor,
      bucket: 'promotional',
      reason: params.reason,
    };
  }

  /**
   * Computes the current balance from a history of credits and debits.
   * Enforces the invariant that no bucket balance goes negative.
   */
  computeBalance(
    credits: BucketDebit[],
    debits: BucketDebit[],
  ): WalletBalance {
    const balance: WalletBalance = { promotional: 0n, rewards: 0n, cash: 0n };

    for (const credit of credits) {
      balance[credit.bucket] += credit.amountMinor;
    }
    for (const debit of debits) {
      balance[debit.bucket] -= debit.amountMinor;
    }

    for (const bucket of SPEND_ORDER) {
      if (balance[bucket] < 0n) {
        throw new Error(
          `Bucket '${bucket}' balance is negative — append-only invariant violation`,
        );
      }
    }

    return balance;
  }
}
