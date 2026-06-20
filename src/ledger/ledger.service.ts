import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { FinancialWriteContext } from '../common/types';

export interface LedgerEntryInput {
  accountId: string;
  transactionId?: string;
  entryType: 'CREDIT' | 'DEBIT' | 'OFFSET';
  amountMinor: bigint;
  currency: string;
  offsetOfEntryId?: string;
  context: FinancialWriteContext;
}

export interface LedgerEntry extends Omit<LedgerEntryInput, 'context'> {
  id: string;
  /** Monotonic position of this entry in the append-only chain (0-based). */
  sequence: number;
  ruleAppliedId: string;
  auditTraceId: string;
  correlationId?: string;
  /** Hash of the immediately preceding entry (genesis hash for the first entry). */
  prevHash: string;
  /** Tamper-evident hash binding this entry's content to the chain. */
  entryHash: string;
  createdAt: string;
}

export interface IntegrityReport {
  valid: boolean;
  entryCount: number;
  /** Sequence index of the first entry that failed verification, if any. */
  brokenAtSequence?: number;
  message: string;
}

/** Hash of the empty chain — the prevHash of the very first ledger entry. */
const GENESIS_HASH = '0'.repeat(64);

@Injectable()
export class LedgerService {
  private readonly entries: LedgerEntry[] = [];

  appendEntry(input: LedgerEntryInput): LedgerEntry {
    this.validateInput(input);

    const prevHash =
      this.entries.length === 0
        ? GENESIS_HASH
        : this.entries[this.entries.length - 1].entryHash;
    const sequence = this.entries.length;

    const base = {
      id: `le_${randomUUID()}`,
      sequence,
      accountId: input.accountId,
      transactionId: input.transactionId,
      entryType: input.entryType,
      amountMinor: input.amountMinor,
      currency: input.currency,
      offsetOfEntryId: input.offsetOfEntryId,
      ruleAppliedId: input.context.ruleAppliedId,
      auditTraceId: input.context.auditTraceId,
      correlationId: input.context.correlationId,
      prevHash,
      createdAt: new Date().toISOString(),
    };

    const entry: LedgerEntry = {
      ...base,
      entryHash: this.computeEntryHash(base),
    };

    // Freeze to make immutability a runtime guarantee, not just a convention.
    Object.freeze(entry);
    this.entries.push(entry);
    return entry;
  }

  listEntriesForAccount(accountId: string): LedgerEntry[] {
    return this.entries.filter((entry) => entry.accountId === accountId);
  }

  /**
   * Recomputes the hash chain from genesis and confirms no entry has been
   * mutated, reordered or removed. This is the auditable proof that the
   * append-only ledger is intact.
   */
  verifyIntegrity(): IntegrityReport {
    let prevHash = GENESIS_HASH;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.sequence !== i || entry.prevHash !== prevHash) {
        return {
          valid: false,
          entryCount: this.entries.length,
          brokenAtSequence: i,
          message: `Chain link broken at sequence ${i}`,
        };
      }

      const { entryHash, ...content } = entry;
      if (this.computeEntryHash(content) !== entryHash) {
        return {
          valid: false,
          entryCount: this.entries.length,
          brokenAtSequence: i,
          message: `Entry content tampered at sequence ${i}`,
        };
      }

      prevHash = entryHash;
    }

    return {
      valid: true,
      entryCount: this.entries.length,
      message: 'Ledger chain intact',
    };
  }

  private validateInput(input: LedgerEntryInput): void {
    if (!input.context.ruleAppliedId?.trim()) {
      throw new Error('ruleAppliedId is required for all financial writes');
    }
    if (!input.context.auditTraceId?.trim()) {
      throw new Error('auditTraceId is required for all financial writes');
    }
    if (!input.accountId?.trim()) {
      throw new Error('accountId is required for all financial writes');
    }
    if (input.amountMinor <= 0n) {
      throw new Error('Ledger amountMinor must be a positive integer');
    }
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new Error(`Invalid currency code: '${input.currency}'`);
    }
    if (input.entryType === 'OFFSET') {
      if (!input.offsetOfEntryId?.trim()) {
        throw new Error('OFFSET entries must reference offsetOfEntryId');
      }
      if (!this.entries.some((e) => e.id === input.offsetOfEntryId)) {
        throw new Error(
          `OFFSET references unknown ledger entry '${input.offsetOfEntryId}'`,
        );
      }
    }
  }

  private computeEntryHash(content: Omit<LedgerEntry, 'entryHash'>): string {
    // Deterministic, field-ordered serialization. bigint is stringified so the
    // hash is stable across serializers and JSON round-trips.
    const canonical = JSON.stringify({
      id: content.id,
      sequence: content.sequence,
      accountId: content.accountId,
      transactionId: content.transactionId ?? null,
      entryType: content.entryType,
      amountMinor: content.amountMinor.toString(),
      currency: content.currency,
      offsetOfEntryId: content.offsetOfEntryId ?? null,
      ruleAppliedId: content.ruleAppliedId,
      auditTraceId: content.auditTraceId,
      correlationId: content.correlationId ?? null,
      prevHash: content.prevHash,
      createdAt: content.createdAt,
    });

    return createHash('sha256').update(canonical).digest('hex');
  }
}
