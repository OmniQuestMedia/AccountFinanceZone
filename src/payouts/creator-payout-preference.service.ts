import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { randomUUID } from 'crypto';

const VALID_PAYOUT_METHODS = new Set([
  'DIRECT_DEPOSIT',
  'E_TRANSFER',
  'WIRE_TRANSFER',
  'CHECK_BY_MAIL',
  'CRYPTO_NOWPAYMENTS',
]);

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
    if (!VALID_PAYOUT_METHODS.has(input.preferredMethod)) {
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
        etransfer_email: input.etransferEmail ?? null,
        wire_details: wireEncrypted ? { encrypted: wireEncrypted } : undefined,
        crypto_wallet_address: input.cryptoWalletAddress ?? null,
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
        etransfer_email: input.etransferEmail ?? null,
        wire_details: wireEncrypted ? { encrypted: wireEncrypted } : Prisma.JsonNull,
        crypto_wallet_address: input.cryptoWalletAddress ?? null,
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
    };
  }
}
