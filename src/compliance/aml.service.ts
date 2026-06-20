import { Injectable } from '@nestjs/common';

const AML_REPORTING_THRESHOLD_MINOR = 1_000_000n; // CAD $10,000
const PEP_SCREENING_THRESHOLD_MINOR = 100_000n; // CAD $1,000
const STRUCTURING_WINDOW_MS = 24 * 60 * 60 * 1000;
const STRUCTURING_COUNT_THRESHOLD = 3;
const STRUCTURING_TOTAL_THRESHOLD_MINOR = 1_000_000n;

export type AmlFlag = 'THRESHOLD_EXCEEDED' | 'PEP_SCREENING_REQUIRED' | 'STRUCTURING_DETECTED';

export interface RecentTransaction {
  amountMinor: bigint;
  occurredAt: Date;
}

export interface AmlCheckInput {
  accountId: string;
  amountMinor: bigint;
  recentTransactions: RecentTransaction[];
  nowMs?: number;
}

export interface AmlCheckResult {
  flags: AmlFlag[];
  requiresManualReview: boolean;
}

@Injectable()
export class AmlService {
  check(input: AmlCheckInput): AmlCheckResult {
    const flags: AmlFlag[] = [];
    const nowMs = input.nowMs ?? Date.now();

    if (input.amountMinor >= AML_REPORTING_THRESHOLD_MINOR) {
      flags.push('THRESHOLD_EXCEEDED');
    }

    if (input.amountMinor >= PEP_SCREENING_THRESHOLD_MINOR) {
      flags.push('PEP_SCREENING_REQUIRED');
    }

    const windowStart = nowMs - STRUCTURING_WINDOW_MS;
    const windowTxns = input.recentTransactions.filter(
      (t) => t.occurredAt.getTime() >= windowStart,
    );
    if (windowTxns.length + 1 >= STRUCTURING_COUNT_THRESHOLD) {
      const total = windowTxns.reduce((sum, t) => sum + t.amountMinor, input.amountMinor);
      if (total >= STRUCTURING_TOTAL_THRESHOLD_MINOR) {
        flags.push('STRUCTURING_DETECTED');
      }
    }

    return { flags, requiresManualReview: flags.length > 0 };
  }
}
