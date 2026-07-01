/**
 * GATED one-off backfill — encrypt legacy plaintext payout-destination PII.
 *
 * Authority: ARCHITECTURE_CANON_ADDENDUM_A §A14 (Kevin ruling 2026-07-01).
 *
 * Encrypts `etransfer_email` and `crypto_wallet_address` on
 * `CreatorPayoutPreference` rows that still hold plaintext, using the SAME
 * AES-256-GCM path the service uses. Idempotent: a value that already decrypts
 * is treated as already-encrypted and skipped, so re-running is safe.
 *
 * This is a DATA MIGRATION on the ledger-adjacent DB — DOCTRINE-GATED.
 * Do NOT run in CI or unattended. Kevin runs it on his box AFTER the schema
 * `prisma db push` (VarChar(200) -> Text) has widened the two columns.
 *
 * Usage (Kevin's box, with DATABASE_URL + ENCRYPTION_MASTER_KEY set):
 *   npx ts-node scripts/backfill-payout-pii-encryption.ts
 *   npx ts-node scripts/backfill-payout-pii-encryption.ts --dry-run
 *
 * The master key is read from the environment (ENCRYPTION_MASTER_KEY) — it is
 * never hard-coded here and must never be printed or logged.
 */
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '../src/common/encryption.service';

const prisma = new PrismaClient();
const encryption = new EncryptionService();

/** Already-encrypted iff it decrypts cleanly under the current key. */
function isEncrypted(value: string): boolean {
  try {
    encryption.decrypt(value);
    return true;
  } catch {
    return false;
  }
}

/** Returns ciphertext if the value is plaintext; null if no change needed. */
function encryptIfPlaintext(value: string | null): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (isEncrypted(value)) return null; // idempotent: leave encrypted values as-is
  return encryption.encrypt(value);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const rows = await prisma.creatorPayoutPreference.findMany({
    select: {
      id: true,
      etransfer_email: true,
      crypto_wallet_address: true,
    },
  });

  let scanned = 0;
  let changed = 0;

  for (const row of rows) {
    scanned += 1;
    const nextEmail = encryptIfPlaintext(row.etransfer_email);
    const nextWallet = encryptIfPlaintext(row.crypto_wallet_address);

    if (nextEmail === null && nextWallet === null) continue;

    const data: {
      etransfer_email?: string;
      crypto_wallet_address?: string;
    } = {};
    if (nextEmail !== null) data.etransfer_email = nextEmail;
    if (nextWallet !== null) data.crypto_wallet_address = nextWallet;

    // Never log the plaintext or ciphertext — only the row id and which fields.
    // eslint-disable-next-line no-console
    console.log(
      `[${dryRun ? 'DRY-RUN' : 'ENCRYPT'}] ${row.id}: ${Object.keys(data).join(', ')}`,
    );

    changed += 1;
    if (!dryRun) {
      await prisma.creatorPayoutPreference.update({
        where: { id: row.id },
        data,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Backfill ${dryRun ? '(dry-run) ' : ''}complete: scanned=${scanned}, ${dryRun ? 'would-encrypt' : 'encrypted'}=${changed}`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Backfill failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
