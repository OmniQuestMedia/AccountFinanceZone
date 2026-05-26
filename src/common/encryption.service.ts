import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * EncryptionService provides field-level encryption for sensitive financial data.
 *
 * Uses AES-256-GCM for authenticated encryption with environment-based key management.
 * In production, this should integrate with a proper KMS (AWS KMS, Azure Key Vault, etc.).
 *
 * PCI-DSS Compliance Note:
 * - This service encrypts sensitive metadata only (e.g., token fingerprints, internal references)
 * - Raw PAN/CVV data is NEVER stored - only provider tokens are used
 * - All encryption keys must be rotated according to PCI-DSS requirements
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits for GCM
  private readonly authTagLength = 16; // 128 bits authentication tag

  /**
   * Derives encryption key from environment variable.
   * In production, this should be replaced with KMS-managed keys.
   */
  private getEncryptionKey(): Buffer {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;

    if (!masterKey) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY environment variable not set. ' +
        'This is required for data-at-rest encryption.'
      );
    }

    // Derive a 256-bit key using SHA-256
    return createHash('sha256').update(masterKey).digest();
  }

  /**
   * Encrypts sensitive data using AES-256-GCM.
   * Returns base64-encoded string in format: iv:authTag:encryptedData
   *
   * @param plaintext - The data to encrypt
   * @returns Encrypted data in base64 format with IV and auth tag
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty or null plaintext');
    }

    const key = this.getEncryptionKey();
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypts data encrypted with the encrypt() method.
   *
   * @param encryptedData - Encrypted data in format iv:authTag:encryptedData
   * @returns Decrypted plaintext
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      throw new Error('Cannot decrypt empty or null data');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format. Expected: iv:authTag:encryptedData');
    }

    const [ivBase64, authTagBase64, encrypted] = parts;

    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Creates a secure one-way hash for data that needs to be matched but not reversed.
   * Useful for creating searchable fingerprints of encrypted data.
   *
   * @param data - Data to hash
   * @returns SHA-256 hash in hexadecimal format
   */
  hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validates that encryption is properly configured.
   * Should be called during application bootstrap.
   */
  validateConfiguration(): void {
    try {
      this.getEncryptionKey();

      // Test encryption/decryption
      const testData = 'test-encryption-validation';
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);

      if (decrypted !== testData) {
        throw new Error('Encryption validation failed: decrypted data does not match');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Encryption service validation failed: ${message}`);
    }
  }
}
