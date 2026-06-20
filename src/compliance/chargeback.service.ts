import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type ChargebackStatus =
  | 'OPEN'
  | 'EVIDENCE_SUBMITTED'
  | 'RESOLVED_WON'
  | 'RESOLVED_LOST';

export interface ChargebackEvidence {
  ledgerEntryIds: string[];
  gateguardAuthToken?: string;
  ecommsReceiptId?: string;
}

export interface ChargebackPackage {
  id: string;
  transactionId: string;
  accountId: string;
  amountMinor: bigint;
  currency: string;
  status: ChargebackStatus;
  evidence: ChargebackEvidence;
  assembledAt: string;
}

export interface AssembleChargebackInput {
  transactionId: string;
  accountId: string;
  amountMinor: bigint;
  currency: string;
  ledgerEntryIds: string[];
  gateguardAuthToken?: string;
  ecommsReceiptId?: string;
}

const ALLOWED_STATUS_TRANSITIONS: Record<ChargebackStatus, ChargebackStatus[]> =
  {
    OPEN: ['EVIDENCE_SUBMITTED'],
    EVIDENCE_SUBMITTED: ['RESOLVED_WON', 'RESOLVED_LOST'],
    RESOLVED_WON: [],
    RESOLVED_LOST: [],
  };

@Injectable()
export class ChargebackService {
  private readonly packages = new Map<string, ChargebackPackage>();

  /**
   * Assembles an immutable chargeback dispute package from the given evidence.
   * Package content is immutable once assembled; only status transitions are permitted.
   * Funds are held from merchant payout — never from the user wallet.
   */
  assemble(input: AssembleChargebackInput): ChargebackPackage {
    const pkg: ChargebackPackage = {
      id: `cbk_${randomUUID()}`,
      transactionId: input.transactionId,
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'OPEN',
      evidence: {
        ledgerEntryIds: [...input.ledgerEntryIds],
        gateguardAuthToken: input.gateguardAuthToken,
        ecommsReceiptId: input.ecommsReceiptId,
      },
      assembledAt: new Date().toISOString(),
    };

    this.packages.set(pkg.id, pkg);
    return { ...pkg, evidence: { ...pkg.evidence } };
  }

  /**
   * Transitions a chargeback package to a new status.
   * Only permitted transitions are allowed; terminal statuses are immutable.
   */
  transition(id: string, newStatus: ChargebackStatus): ChargebackPackage {
    const pkg = this.packages.get(id);
    if (!pkg) {
      throw new Error(`Chargeback package not found: ${id}`);
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[pkg.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${pkg.status} -> ${newStatus}`,
      );
    }

    pkg.status = newStatus;
    return { ...pkg, evidence: { ...pkg.evidence } };
  }

  getPackage(id: string): ChargebackPackage | undefined {
    const pkg = this.packages.get(id);
    return pkg ? { ...pkg, evidence: { ...pkg.evidence } } : undefined;
  }
}
