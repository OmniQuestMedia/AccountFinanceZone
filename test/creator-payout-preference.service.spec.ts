import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreatorPayoutPreferenceService } from '../src/payouts/creator-payout-preference.service';
import { EncryptionService } from '../src/common/encryption.service';

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

  it('decrypts encrypted JSON fields on read', async () => {
    const pref = makePreference({
      direct_deposit_details: { encrypted: 'enc({"accountNumber":"12345"})' },
    });
    const prisma = makePrisma(pref);
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      mockEncryption as never,
    );

    const result = await service.getByCreatorId('creator-1');

    expect(mockEncryption.decrypt).toHaveBeenCalledWith(
      'enc({"accountNumber":"12345"})',
    );
    expect(result.direct_deposit_details).toEqual({ accountNumber: '12345' });
  });

  it('returns plain object fields untouched when they are not encrypted envelopes', async () => {
    const pref = makePreference({
      wire_details: { bank: 'plain-value' },
    });
    const prisma = makePrisma(pref);
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      mockEncryption as never,
    );

    const result = await service.getByCreatorId('creator-1');

    // Non-envelope objects are passed through without a decrypt attempt
    expect(result.wire_details).toEqual({ bank: 'plain-value' });
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

describe('CreatorPayoutPreferenceService — payout-destination PII encryption (A14)', () => {
  const REAL_KEY = 'test-master-key-a14-encryption-not-a-real-secret';
  let savedKey: string | undefined;

  beforeAll(() => {
    savedKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = REAL_KEY;
  });

  afterAll(() => {
    if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
    else process.env.ENCRYPTION_MASTER_KEY = savedKey;
  });

  const ciphertextFormat = /^[^:]+:[^:]+:[^:]+$/; // iv:authTag:data

  it('stores etransfer_email and crypto_wallet_address as ciphertext at rest', async () => {
    const encryption = new EncryptionService();
    const prisma = makePrisma();
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      encryption as never,
    );

    const email = 'creator.payout@example.com';
    const wallet = '0x' + 'a'.repeat(40);

    await service.upsert({
      creatorId: 'c1',
      preferredMethod: 'E_TRANSFER',
      etransferEmail: email,
      cryptoWalletAddress: wallet,
    });

    const { create } = (prisma.creatorPayoutPreference.upsert as jest.Mock).mock
      .calls[0][0];

    // At rest: not the plaintext, and in iv:authTag:data ciphertext format.
    expect(create.etransfer_email).not.toBe(email);
    expect(create.crypto_wallet_address).not.toBe(wallet);
    expect(create.etransfer_email).toMatch(ciphertextFormat);
    expect(create.crypto_wallet_address).toMatch(ciphertextFormat);
    // Ciphertext decrypts back to the original plaintext.
    expect(encryption.decrypt(create.etransfer_email)).toBe(email);
    expect(encryption.decrypt(create.crypto_wallet_address)).toBe(wallet);
  });

  it('round-trips encrypted scalar PII on read', async () => {
    const encryption = new EncryptionService();
    const email = 'roundtrip@example.com';
    const wallet = '4'.repeat(95); // long (Monero-style) address
    const pref = makePreference({
      etransfer_email: encryption.encrypt(email),
      crypto_wallet_address: encryption.encrypt(wallet),
    });
    const prisma = makePrisma(pref);
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      encryption as never,
    );

    const result = await service.getByCreatorId('creator-1');
    expect(result.etransfer_email).toBe(email);
    expect(result.crypto_wallet_address).toBe(wallet);
  });

  it('tolerates legacy plaintext rows on read (pre-backfill)', async () => {
    const encryption = new EncryptionService();
    // Legacy row: values stored before A14, still plaintext.
    const pref = makePreference({
      etransfer_email: 'legacy.plaintext@example.com',
      crypto_wallet_address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    });
    const prisma = makePrisma(pref);
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      encryption as never,
    );

    const result = await service.getByCreatorId('creator-1');
    // Falls back to raw value instead of throwing.
    expect(result.etransfer_email).toBe('legacy.plaintext@example.com');
    expect(result.crypto_wallet_address).toBe(
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    );
  });

  it('leaves null scalar PII as null (no encryption of empty)', async () => {
    const encryption = new EncryptionService();
    const prisma = makePrisma();
    const service = new CreatorPayoutPreferenceService(
      prisma as never,
      encryption as never,
    );

    await service.upsert({ creatorId: 'c1', preferredMethod: 'E_TRANSFER' });

    const { create } = (prisma.creatorPayoutPreference.upsert as jest.Mock).mock
      .calls[0][0];
    expect(create.etransfer_email).toBeNull();
    expect(create.crypto_wallet_address).toBeNull();
  });
});
