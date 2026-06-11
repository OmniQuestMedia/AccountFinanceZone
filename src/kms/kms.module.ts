import { Module, Global } from '@nestjs/common';
import { KmsConfigService } from './kms-config.service';

/**
 * KMS Module
 *
 * Provides encryption key management for the financial service.
 * This module is global so KMS configuration is available throughout the app.
 *
 * Security:
 * - Separate KMS key isolated from other services
 * - Canadian data residency enforced
 * - Configuration validated on startup
 */
@Global()
@Module({
  providers: [KmsConfigService],
  exports: [KmsConfigService],
})
export class KmsModule {}
