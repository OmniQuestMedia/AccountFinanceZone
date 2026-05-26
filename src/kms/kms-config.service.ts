import { Injectable, Logger } from '@nestjs/common';

/**
 * KMS Configuration Service
 *
 * Manages encryption keys for the financial service.
 * In production, this integrates with AWS KMS for key management.
 *
 * Security Requirements:
 * - Separate KMS key for AccountFinanceZone (isolated from other services)
 * - Canadian data residency (ca-central-1 region)
 * - Encryption at rest for all sensitive data
 * - Key rotation policy enforced
 */
@Injectable()
export class KmsConfigService {
  private readonly logger = new Logger(KmsConfigService.name);
  private readonly kmsKeyId: string;
  private readonly kmsKeyAlias: string;
  private readonly region: string;
  private readonly encryptionEnabled: boolean;

  constructor() {
    // Load KMS configuration from environment
    this.region = process.env.AWS_REGION || 'ca-central-1';
    this.kmsKeyId = process.env.AWS_KMS_KEY_ID || '';
    this.kmsKeyAlias =
      process.env.AWS_KMS_KEY_ALIAS ||
      'alias/accountfinancezone-encryption-key';
    this.encryptionEnabled = process.env.DB_ENCRYPTION_ENABLED === 'true';

    // Validate Canadian data residency
    if (this.region !== 'ca-central-1') {
      throw new Error(
        `KMS key must be in ca-central-1 region for Canadian data residency. Got: ${this.region}`,
      );
    }

    this.logger.log('KMS Configuration initialized');
    this.logger.log(`Region: ${this.region}`);
    this.logger.log(`Key Alias: ${this.kmsKeyAlias}`);
    this.logger.log(`Encryption Enabled: ${this.encryptionEnabled}`);

    if (!this.kmsKeyId && process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'AWS_KMS_KEY_ID not configured. Encryption at rest may not be active in production!',
      );
    }
  }

  /**
   * Get the KMS key ID for encryption operations
   */
  getKeyId(): string {
    return this.kmsKeyId;
  }

  /**
   * Get the KMS key alias
   */
  getKeyAlias(): string {
    return this.kmsKeyAlias;
  }

  /**
   * Get the AWS region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Check if encryption is enabled
   */
  isEncryptionEnabled(): boolean {
    return this.encryptionEnabled;
  }

  /**
   * Validate KMS configuration is ready for production use
   */
  validateProductionReady(): boolean {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    const errors: string[] = [];

    if (!this.kmsKeyId) {
      errors.push('AWS_KMS_KEY_ID must be set in production');
    }

    if (!this.encryptionEnabled) {
      errors.push('DB_ENCRYPTION_ENABLED must be true in production');
    }

    if (this.region !== 'ca-central-1') {
      errors.push(
        'AWS_REGION must be ca-central-1 for Canadian data residency',
      );
    }

    if (errors.length > 0) {
      this.logger.error('KMS configuration validation failed:');
      errors.forEach((error) => this.logger.error(`  - ${error}`));
      return false;
    }

    return true;
  }

  /**
   * Get KMS configuration summary for logging/debugging
   * (Excludes sensitive values)
   */
  getConfigSummary(): {
    region: string;
    keyAlias: string;
    hasKeyId: boolean;
    encryptionEnabled: boolean;
  } {
    return {
      region: this.region,
      keyAlias: this.kmsKeyAlias,
      hasKeyId: !!this.kmsKeyId,
      encryptionEnabled: this.encryptionEnabled,
    };
  }
}
