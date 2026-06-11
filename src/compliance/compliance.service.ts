import { Injectable } from '@nestjs/common';

export interface ComplianceDecision {
  approved: boolean;
  reason?: string;
}

export interface ComplianceInput {
  operation: 'PAYMENT' | 'PAYOUT' | 'REFUND' | 'CHARGEBACK';
  accountId: string;
  amountMinor: bigint;
  currency: string;
  residencyRegion: string;
}

@Injectable()
export class ComplianceService {
  evaluate(input: ComplianceInput): ComplianceDecision {
    if (input.residencyRegion !== 'CA') {
      return { approved: false, reason: 'Canadian data residency only' };
    }

    // Integration point with OmniComplianceZone for policy/as-of checks.
    return { approved: true };
  }
}
