import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreatorPayoutPreferenceService } from '../src/payouts/creator-payout-preference.service';

const mockEncryption = {
  encrypt: jest.fn((v: string) => `enc(${v})`),
  decrypt: jest.fn((v: string) => v.replace(/^enc\(/, '').replace(/\)$/, '')),
};

const makePreference = (overrides: Record<string, unknown> = {}) => ({
  id: 'pref-1',
  creator_id: 'creator-1',
  preferred_method: 'E_TRANSFER',
  direct_deposit_details: null,
  etransfer_email: 'creator@example.com',
  wire_details: null,
  crypto_wallet_address: null,
  mailing_address: null,
  correlation_id: 'cppref_1',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const makePrisma = (existing: ReturnType<typeof makePreference> | null = null) => ({
  creatorPayoutPreference: {
    findUnique: jest.fn().mockResolvedValue(existing),
    upsert: jest.fn().mockImplementation(({ create, update }) =>
      Promise.resolve(existing ? { ...existing, ...update } : create),
    ),
  },
});

describe('CreatorPayoutPreferenceService', () => {
  it('rejects unknown preferredMethod', async () => {
    const prisma = makePrisma();
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      mockEncryption as never,
    );

    await expect(
      service.upsert({ creatorId: 'c1', preferredMethod: 'UNKNOWN_METHOD' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates preference with encrypted direct_deposit_details', async () => {
    const prisma = makePrisma();
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      mockEncryption as never,
    );

    await service.upsert({
      creatorId: 'c1',
      preferredMethod: 'DIRECT_DEPOSIT',
      directDepositDetails: { accountNumber: '12345' },
    });

    expect(mockEncryption.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ accountNumber: '12345' }),
    );
  });

  it('clears stale encrypted fields on update when not provided', async () => {
    const existing = makePreference({
      direct_deposit_details: { encrypted: 'enc({"accountNumber":"12345"})' },
    });
    const prisma = makePrisma(existing);
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      mockEncryption as never,
    );

    await service.upsert({
      creatorId: 'creator-1',
      preferredMethod: 'E_TRANSFER',
      etransferEmail: 'new@example.com',
    });

    const { update } = (prisma.creatorPayoutPreference.upsert as jest.Mock).mock
      .calls[0][0];
    // Prisma.JsonNull sentinel is used to explicitly null out nullable JSON columns
    expect(update.direct_deposit_details).not.toBeUndefined();
  });

  it('decryptJson returns null for null field', async () => {
    const pref = makePreference();
    const prisma = makePrisma(pref);
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      mockEncryption as never,
    );

    const result = await service.getByCreatorId('creator-1');
    expect(result.direct_deposit_details).toBeNull();
    expect(result.wire_details).toBeNull();
    expect(result.mailing_address).toBeNull();
  });

  it('throws NotFoundException when preference does not exist', async () => {
    const prisma = makePrisma(null);
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      mockEncryption as never,
    );

    await expect(service.getByCreatorId('unknown')).rejects.toThrow(
      NotFoundException,
    );
  });
});
