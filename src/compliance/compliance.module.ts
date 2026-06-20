import { Module } from '@nestjs/common';
import { AmlService } from './aml.service';
import { ChargebackService } from './chargeback.service';
import { ComplianceGuard } from './compliance.guard';
import { ComplianceService } from './compliance.service';

@Module({
  providers: [ComplianceService, ComplianceGuard, AmlService, ChargebackService],
  exports: [ComplianceService, ComplianceGuard, AmlService, ChargebackService],
})
export class ComplianceModule {}
