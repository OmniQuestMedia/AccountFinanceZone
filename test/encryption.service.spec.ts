import { EncryptionService } from '../src/common/encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const originalEnv = process.env.ENCRYPTION_MASTER_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_MASTER_KEY =
      'test-master-key-for-development-only-min-32-chars';
  });

  afterAll(() => {
    if (originalEnv) {
      process.env.ENCRYPTION_MASTER_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  beforeEach(() => {
    service = new EncryptionService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data successfully', () => {
      const plaintext = 'sensitive-payment-token-12345';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (due to random IV)', () => {
      const plaintext = 'sensitive-data';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle special characters and unicode', () => {
      const plaintext = 'Special chars: !@#$%^&*() 中文 émojis 🔐';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when encrypting empty string', () => {
      expect(() => service.encrypt('')).toThrow(
        'Cannot encrypt empty or null plaintext',
      );
    });

    it('should throw error when encrypting null', () => {
      expect(() => service.encrypt(null as any)).toThrow(
        'Cannot encrypt empty or null plaintext',
      );
    });

    it('should throw error when decrypting invalid format', () => {
      expect(() => service.decrypt('invalid-format')).toThrow(
        'Invalid encrypted data format',
      );
    });

    it('should throw error when decrypting tampered data', () => {
      const plaintext = 'sensitive-data';
      const encrypted = service.encrypt(plaintext);

      // Tamper with the encrypted data
      const parts = encrypted.split(':');
      parts[2] = parts[2].slice(0, -4) + 'XXXX'; // Modify last 4 chars
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect authentication tag mismatch', () => {
      const encrypted = service.encrypt('test-data');
      const parts = encrypted.split(':');

      // Modify the auth tag
      const authTag = Buffer.from(parts[1], 'base64');
      authTag[0] = authTag[0] ^ 0xff; // Flip bits in first byte
      parts[1] = authTag.toString('base64');

      const tampered = parts.join(':');
      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('hash', () => {
    it('should create consistent hash for same input', () => {
      const data = 'token-fingerprint-data';
      const hash1 = service.hash(data);
      const hash2 = service.hash(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should create different hashes for different inputs', () => {
      const hash1 = service.hash('data-1');
      const hash2 = service.hash('data-2');

      expect(hash1).not.toBe(hash2);
    });

    it('should create deterministic fingerprints', () => {
      const tokenData = '4111-1111-1111-1111'; // Example token format
      const fingerprint = service.hash(tokenData);

      // Should always produce same fingerprint for lookup
      expect(service.hash(tokenData)).toBe(fingerprint);
    });
  });

  describe('validateConfiguration', () => {
    it('should validate encryption configuration successfully', () => {
      expect(() => service.validateConfiguration()).not.toThrow();
    });

    it('should fail when ENCRYPTION_MASTER_KEY is not set', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;

      const testService = new EncryptionService();
      expect(() => testService.validateConfiguration()).toThrow(
        'ENCRYPTION_MASTER_KEY environment variable not set',
      );

      // Restore for other tests
      process.env.ENCRYPTION_MASTER_KEY =
        'test-master-key-for-development-only-min-32-chars';
    });
  });

  describe('PCI-DSS compliance scenarios', () => {
    it('should encrypt payment token fingerprints', () => {
      const tokenFingerprint = 'fp_1234567890abcdef';
      const encrypted = service.encrypt(tokenFingerprint);

      expect(encrypted).not.toContain(tokenFingerprint);
      expect(service.decrypt(encrypted)).toBe(tokenFingerprint);
    });

    it('should create searchable hash for encrypted token lookup', () => {
      const providerToken = 'tok_test_1234567890';

      // Store encrypted version
      const encrypted = service.encrypt(providerToken);

      // Create searchable hash (never store plaintext)
      const searchHash = service.hash(providerToken);

      // In production: store both encrypted and hash
      // Query by hash, decrypt when needed
      expect(encrypted).not.toBe(providerToken);
      expect(searchHash).toHaveLength(64);

      // Hash is deterministic for lookup
      expect(service.hash(providerToken)).toBe(searchHash);
    });
  });
});
