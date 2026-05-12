import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
  ruleAppliedId: string;
  auditTraceId: string;
  createdAt: string;
}

@Injectable()
export class LedgerService {
  private readonly entries: LedgerEntry[] = [];

  appendEntry(input: LedgerEntryInput): LedgerEntry {
    if (!input.context.ruleAppliedId?.trim()) {
      throw new Error('ruleAppliedId is required for all financial writes');
    }

    const entry: LedgerEntry = {
      id: `le_${randomUUID()}`,
      accountId: input.accountId,
      transactionId: input.transactionId,
      entryType: input.entryType,
      amountMinor: input.amountMinor,
      currency: input.currency,
      offsetOfEntryId: input.offsetOfEntryId,
      ruleAppliedId: input.context.ruleAppliedId,
      auditTraceId: input.context.auditTraceId,
      createdAt: new Date().toISOString(),
    };

    this.entries.push(entry);
    return entry;
  }

  listEntriesForAccount(accountId: string): LedgerEntry[] {
    return this.entries.filter((entry) => entry.accountId === accountId);
  }
}
