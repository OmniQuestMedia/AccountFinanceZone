import { Injectable } from '@nestjs/common';
import { ComplianceService, ComplianceInput } from './compliance.service';

@Injectable()
export class ComplianceGuard {
  constructor(private readonly complianceService: ComplianceService) {}

  assertMoneyMovementAllowed(input: ComplianceInput): void {
    const decision = this.complianceService.evaluate(input);
    if (!decision.approved) {
      throw new Error(decision.reason ?? 'Compliance blocked this operation');
    }
  }
}
