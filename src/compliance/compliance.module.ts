import { Module } from '@nestjs/common';
import { ComplianceGuard } from './compliance.guard';
import { ComplianceService } from './compliance.service';

@Module({
  providers: [ComplianceService, ComplianceGuard],
  exports: [ComplianceService, ComplianceGuard],
})
export class ComplianceModule {}
