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

const NEW_ACCOUNT_DAYS_THRESHOLD = 7;
const HIGH_VELOCITY_THRESHOLD = 8;
const LARGE_AMOUNT_THRESHOLD_MINOR = 200000n;
const REVIEW_SCORE_THRESHOLD = 45;
const BLOCK_SCORE_THRESHOLD = 80;

@Injectable()
export class FraudService {
  assess(input: FraudSignalInput): FraudAssessmentResult {
    let riskScore = 0;
    const flags: string[] = [];

    if (input.accountAgeDays < NEW_ACCOUNT_DAYS_THRESHOLD) {
      riskScore += 20;
      flags.push('new_account');
    }

    if (input.velocityLastHour > HIGH_VELOCITY_THRESHOLD) {
      riskScore += 40;
      flags.push('high_velocity');
    }

    if (input.amountMinor > LARGE_AMOUNT_THRESHOLD_MINOR) {
      riskScore += 35;
      flags.push('large_amount');
    }

    if (input.cardCountry && input.accountCountry && input.cardCountry !== input.accountCountry) {
      riskScore += 25;
      flags.push('geo_mismatch');
    }

    const decision =
      riskScore >= BLOCK_SCORE_THRESHOLD ? 'BLOCK' : riskScore >= REVIEW_SCORE_THRESHOLD ? 'REVIEW' : 'ALLOW';
    return { riskScore, flags, decision };
  }
}
