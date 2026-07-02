import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { isValidPayoutMethod } from './payout-methods';
import { randomUUID } from 'crypto';

export interface SetPayoutPreferenceInput {
  creatorId: string;
  preferredMethod: string;
  directDepositDetails?: Record<string, unknown>;
  etransferEmail?: string;
  wireDetails?: Record<string, unknown>;
  cryptoWalletAddress?: string;
  mailingAddress?: Record<string, unknown>;
}

@Injectable()
export class CreatorPayoutPreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async upsert(input: SetPayoutPreferenceInput) {
    if (!isValidPayoutMethod(input.preferredMethod)) {
      throw new BadRequestException(
        `Invalid preferredMethod: ${input.preferredMethod}`,
      );
    }

    const directDepositEncrypted = input.directDepositDetails
      ? this.encryption.encrypt(JSON.stringify(input.directDepositDetails))
      : null;

    const wireEncrypted = input.wireDetails
      ? this.encryption.encrypt(JSON.stringify(input.wireDetails))
      : null;

    const mailingEncrypted = input.mailingAddress
      ? this.encryption.encrypt(JSON.stringify(input.mailingAddress))
      : null;

    // Scalar payout-destination PII (A14): encrypt at rest with the same
    // AES-256-GCM path used for the JSON blobs above. Stored as the raw
    // ciphertext string (iv:authTag:data), not a JSON envelope.
    const etransferEmailEncrypted = input.etransferEmail
      ? this.encryption.encrypt(input.etransferEmail)
      : null;

    const cryptoWalletEncrypted = input.cryptoWalletAddress
      ? this.encryption.encrypt(input.cryptoWalletAddress)
      : null;

    const existing = await this.prisma.creatorPayoutPreference.findUnique({
      where: { creator_id: input.creatorId },
    });

    const correlationId = existing?.correlation_id ?? `cppref_${randomUUID()}`;

    return this.prisma.creatorPayoutPreference.upsert({
      where: { creator_id: input.creatorId },
      create: {
        creator_id: input.creatorId,
        preferred_method: input.preferredMethod as never,
        direct_deposit_details: directDepositEncrypted
          ? { encrypted: directDepositEncrypted }
          : undefined,
        etransfer_email: etransferEmailEncrypted,
        wire_details: wireEncrypted ? { encrypted: wireEncrypted } : undefined,
        crypto_wallet_address: cryptoWalletEncrypted,
        mailing_address: mailingEncrypted
          ? { encrypted: mailingEncrypted }
          : undefined,
        correlation_id: correlationId,
      },
      update: {
        preferred_method: input.preferredMethod as never,
        // Explicitly null-out fields not provided so stale encrypted values are cleared
        direct_deposit_details: directDepositEncrypted
          ? { encrypted: directDepositEncrypted }
          : Prisma.JsonNull,
        etransfer_email: etransferEmailEncrypted,
        wire_details: wireEncrypted ? { encrypted: wireEncrypted } : Prisma.JsonNull,
        crypto_wallet_address: cryptoWalletEncrypted,
        mailing_address: mailingEncrypted
          ? { encrypted: mailingEncrypted }
          : Prisma.JsonNull,
      },
    });
  }

  async getByCreatorId(creatorId: string) {
    const pref = await this.prisma.creatorPayoutPreference.findUnique({
      where: { creator_id: creatorId },
    });

    if (!pref) {
      throw new NotFoundException(
        `No payout preference found for creator ${creatorId}`,
      );
    }

    return this.decrypt(pref);
  }

  private decrypt(
    pref: Awaited<
      ReturnType<typeof this.prisma.creatorPayoutPreference.findUniqueOrThrow>
    >,
  ) {
    const decryptJson = (
      val: unknown,
    ): Record<string, unknown> | null => {
      if (val === null || val === undefined) return null;
      if (typeof val !== 'object') return null;
      const obj = val as Record<string, unknown>;
      if (typeof obj['encrypted'] === 'string') {
        return JSON.parse(this.encryption.decrypt(obj['encrypted'])) as Record<
          string,
          unknown
        >;
      }
      return obj;
    };

    return {
      ...pref,
      direct_deposit_details: decryptJson(pref.direct_deposit_details),
      wire_details: decryptJson(pref.wire_details),
      mailing_address: decryptJson(pref.mailing_address),
      etransfer_email: this.decryptScalar(pref.etransfer_email),
      crypto_wallet_address: this.decryptScalar(pref.crypto_wallet_address),
    };
  }

  /**
   * Decrypts a scalar PII string encrypted with the AES-256-GCM path.
   * Tolerates legacy plaintext rows (pre-A14 backfill): if the value is not
   * valid ciphertext, decrypt() throws and we fall back to the raw value.
   */
  private decryptScalar(val: string | null): string | null {
    if (val === null || val === undefined) return null;
    try {
      return this.encryption.decrypt(val);
    } catch {
      return val;
    }
  }
}
