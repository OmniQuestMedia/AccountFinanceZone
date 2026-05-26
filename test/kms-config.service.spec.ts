import { KmsConfigService } from '../src/kms/kms-config.service';

describe('KmsConfigService', () => {
  let service: KmsConfigService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.AWS_REGION = 'ca-central-1';
    process.env.AWS_KMS_KEY_ID =
      'arn:aws:kms:ca-central-1:123456789012:key/test-key-id';
    process.env.AWS_KMS_KEY_ALIAS = 'alias/accountfinancezone-test-key';
    process.env.DB_ENCRYPTION_ENABLED = 'true';
    process.env.NODE_ENV = 'test';

    service = new KmsConfigService();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(service.getRegion()).toBe('ca-central-1');
      expect(service.getKeyId()).toBe(
        'arn:aws:kms:ca-central-1:123456789012:key/test-key-id',
      );
      expect(service.getKeyAlias()).toBe('alias/accountfinancezone-test-key');
      expect(service.isEncryptionEnabled()).toBe(true);
    });

    it('should default to ca-central-1 if AWS_REGION not set', () => {
      delete process.env.AWS_REGION;
      const newService = new KmsConfigService();
      expect(newService.getRegion()).toBe('ca-central-1');
    });

    it('should throw error if region is not ca-central-1', () => {
      process.env.AWS_REGION = 'us-east-1';
      expect(() => new KmsConfigService()).toThrow(
        'KMS key must be in ca-central-1 region for Canadian data residency',
      );
    });
  });

  describe('getConfigSummary', () => {
    it('should return configuration summary without exposing key ID', () => {
      const summary = service.getConfigSummary();
      expect(summary).toEqual({
        region: 'ca-central-1',
        keyAlias: 'alias/accountfinancezone-test-key',
        hasKeyId: true,
        encryptionEnabled: true,
      });
    });

    it('should indicate when key ID is not set', () => {
      delete process.env.AWS_KMS_KEY_ID;
      const newService = new KmsConfigService();
      const summary = newService.getConfigSummary();
      expect(summary.hasKeyId).toBe(false);
    });
  });

  describe('validateProductionReady', () => {
    it('should pass validation in test environment', () => {
      expect(service.validateProductionReady()).toBe(true);
    });

    it('should require KMS key ID in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AWS_KMS_KEY_ID;
      const newService = new KmsConfigService();
      expect(newService.validateProductionReady()).toBe(false);
    });

    it('should require encryption enabled in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_ENCRYPTION_ENABLED = 'false';
      const newService = new KmsConfigService();
      expect(newService.validateProductionReady()).toBe(false);
    });

    it('should require ca-central-1 region in production', () => {
      process.env.NODE_ENV = 'production';
      // This will throw during construction, so we test that
      process.env.AWS_REGION = 'us-west-2';
      expect(() => new KmsConfigService()).toThrow();
    });

    it('should pass validation with all required settings in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.AWS_REGION = 'ca-central-1';
      process.env.AWS_KMS_KEY_ID =
        'arn:aws:kms:ca-central-1:123456789012:key/prod-key';
      process.env.DB_ENCRYPTION_ENABLED = 'true';
      const newService = new KmsConfigService();
      expect(newService.validateProductionReady()).toBe(true);
    });
  });

  describe('encryption settings', () => {
    it('should respect DB_ENCRYPTION_ENABLED flag', () => {
      process.env.DB_ENCRYPTION_ENABLED = 'false';
      const newService = new KmsConfigService();
      expect(newService.isEncryptionEnabled()).toBe(false);
    });

    it('should default encryption to false if not set', () => {
      delete process.env.DB_ENCRYPTION_ENABLED;
      const newService = new KmsConfigService();
      expect(newService.isEncryptionEnabled()).toBe(false);
    });
  });

  describe('Canadian data residency enforcement', () => {
    it('should only allow ca-central-1 region', () => {
      const invalidRegions = ['us-east-1', 'eu-west-1', 'ap-southeast-1'];

      invalidRegions.forEach((region) => {
        process.env.AWS_REGION = region;
        expect(() => new KmsConfigService()).toThrow(
          `KMS key must be in ca-central-1 region for Canadian data residency. Got: ${region}`,
        );
      });
    });
  });
});
