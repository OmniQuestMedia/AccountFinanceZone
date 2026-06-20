import { Injectable } from '@nestjs/common';

export interface AmlCheckInput {
  accountId: string;
  amountMinor: bigint;
  currency: string;
  recentTransactions?: AmlTransactionRecord[];
}

export interface AmlTransactionRecord {
  amountMinor: bigint;
  occurredAt: string;
}

export interface AmlCheckResult {
  flagged: boolean;
  flags: AmlFlag[];
}

export type AmlFlag =
  | 'THRESHOLD_EXCEEDED'
  | 'STRUCTURING_DETECTED'
  | 'PEP_SCREENING_REQUIRED';

// FINTRAC thresholds — CAD, amountMinor = cents
const AML_REPORTING_THRESHOLD_MINOR = 1_000_000n; // CAD $10,000
const PEP_SCREENING_THRESHOLD_MINOR = 100_000n; // CAD $1,000
const STRUCTURING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const STRUCTURING_COUNT_THRESHOLD = 3;
const STRUCTURING_TOTAL_THRESHOLD_MINOR = 1_000_000n; // CAD $10,000

@Injectable()
export class AmlService {
  /**
   * Checks a transaction for FINTRAC/AML flags before money movement.
   * Stub: flags are recorded; FINTRAC reporting is a downstream pipeline step.
   */
  check(input: AmlCheckInput): AmlCheckResult {
    const flags: AmlFlag[] = [];

    if (input.amountMinor >= AML_REPORTING_THRESHOLD_MINOR) {
      flags.push('THRESHOLD_EXCEEDED');
    }

    if (input.amountMinor >= PEP_SCREENING_THRESHOLD_MINOR) {
      flags.push('PEP_SCREENING_REQUIRED');
    }

    if (
      input.recentTransactions &&
      this.detectStructuring(input.amountMinor, input.recentTransactions)
    ) {
      flags.push('STRUCTURING_DETECTED');
    }

    return { flagged: flags.length > 0, flags };
  }

  private detectStructuring(
    currentAmountMinor: bigint,
    recentTransactions: AmlTransactionRecord[],
  ): boolean {
    const windowStart = Date.now() - STRUCTURING_WINDOW_MS;

    const windowTransactions = recentTransactions.filter(
      (t) => new Date(t.occurredAt).getTime() >= windowStart,
    );

    const windowTotal = windowTransactions.reduce(
      (sum, t) => sum + t.amountMinor,
      currentAmountMinor,
    );

    return (
      windowTransactions.length >= STRUCTURING_COUNT_THRESHOLD - 1 &&
      windowTotal >= STRUCTURING_TOTAL_THRESHOLD_MINOR
    );
  }
}
