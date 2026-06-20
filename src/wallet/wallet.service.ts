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
  allocations: BucketDebit[];
  totalDebited: bigint;
}

export interface PromotionalCredit {
  amountMinor: bigint;
  bucket: 'promotional';
  reason: string;
}

const SPEND_ORDER: readonly WalletBucket[] = ['promotional', 'rewards', 'cash'] as const;

@Injectable()
export class WalletService {
  computeDebitAllocation(balance: WalletBalance, amountMinor: bigint): DebitAllocation {
    if (amountMinor <= 0n) {
      throw new Error('Debit amount must be positive');
    }

    const allocations: BucketDebit[] = [];
    let remaining = amountMinor;

    for (const bucket of SPEND_ORDER) {
      if (remaining === 0n) break;
      const available = balance[bucket];
      if (available <= 0n) continue;
      const take = available < remaining ? available : remaining;
      allocations.push({ bucket, amountMinor: take });
      remaining -= take;
    }

    if (remaining > 0n) {
      throw new Error(
        `Insufficient wallet balance: needed ${amountMinor}, shortfall ${remaining}`,
      );
    }

    return { allocations, totalDebited: amountMinor };
  }

  issuePromotionalCredit(params: { amountMinor: bigint; reason: string }): PromotionalCredit {
    return { amountMinor: params.amountMinor, bucket: 'promotional', reason: params.reason };
  }

  computeBalance(credits: BucketDebit[], debits: BucketDebit[]): WalletBalance {
    const balance: WalletBalance = { promotional: 0n, rewards: 0n, cash: 0n };

    for (const c of credits) {
      balance[c.bucket] += c.amountMinor;
    }
    for (const d of debits) {
      balance[d.bucket] -= d.amountMinor;
      if (balance[d.bucket] < 0n) {
        throw new Error(`Wallet bucket '${d.bucket}' went negative`);
      }
    }

    return balance;
  }
}
