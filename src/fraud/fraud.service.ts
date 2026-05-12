import { Injectable } from '@nestjs/common';

export interface FraudSignalInput {
  accountAgeDays: number;
  velocityLastHour: number;
  amountMinor: bigint;
  cardCountry?: string;
  accountCountry?: string;
}

export interface FraudAssessmentResult {
  riskScore: number;
  flags: string[];
  decision: 'ALLOW' | 'REVIEW' | 'BLOCK';
}

@Injectable()
export class FraudService {
  assess(input: FraudSignalInput): FraudAssessmentResult {
    let riskScore = 0;
    const flags: string[] = [];

    if (input.accountAgeDays < 7) {
      riskScore += 20;
      flags.push('new_account');
    }

    if (input.velocityLastHour > 8) {
      riskScore += 40;
      flags.push('high_velocity');
    }

    if (input.amountMinor > 200000n) {
      riskScore += 35;
      flags.push('large_amount');
    }

    if (input.cardCountry && input.accountCountry && input.cardCountry !== input.accountCountry) {
      riskScore += 25;
      flags.push('geo_mismatch');
    }

    const decision = riskScore >= 80 ? 'BLOCK' : riskScore >= 45 ? 'REVIEW' : 'ALLOW';
    return { riskScore, flags, decision };
  }
}
