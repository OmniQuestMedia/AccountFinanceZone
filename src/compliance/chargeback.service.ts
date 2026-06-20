import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type ChargebackStatus =
  | 'OPEN'
  | 'EVIDENCE_SUBMITTED'
  | 'RESOLVED_WON'
  | 'RESOLVED_LOST';

export interface ChargebackEvidence {
  description: string;
  submittedAt: string;
}

export interface ChargebackPackage {
  readonly id: string;
  readonly transactionId: string;
  readonly accountId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  status: ChargebackStatus;
  evidence: ChargebackEvidence[];
  readonly assembledAt: string;
}

export interface AssembleChargebackInput {
  transactionId: string;
  accountId: string;
  amountMinor: bigint;
  currency: string;
  initialEvidence?: ChargebackEvidence;
}

const ALLOWED_STATUS_TRANSITIONS: Record<ChargebackStatus, ChargebackStatus[]> = {
  OPEN: ['EVIDENCE_SUBMITTED'],
  EVIDENCE_SUBMITTED: ['RESOLVED_WON', 'RESOLVED_LOST'],
  RESOLVED_WON: [],
  RESOLVED_LOST: [],
};

@Injectable()
export class ChargebackService {
  private readonly packages = new Map<string, ChargebackPackage>();

  assemble(input: AssembleChargebackInput): ChargebackPackage {
    const pkg: ChargebackPackage = {
      id: `cbk_${randomUUID()}`,
      transactionId: input.transactionId,
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'OPEN',
      evidence: input.initialEvidence ? [input.initialEvidence] : [],
      assembledAt: new Date().toISOString(),
    };
    this.packages.set(pkg.id, pkg);
    return pkg;
  }

  transition(id: string, newStatus: ChargebackStatus): ChargebackPackage {
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error(`Chargeback package not found: ${id}`);

    const allowed = ALLOWED_STATUS_TRANSITIONS[pkg.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid chargeback transition: ${pkg.status} → ${newStatus}`,
      );
    }

    pkg.status = newStatus;
    return pkg;
  }

  getPackage(id: string): ChargebackPackage | undefined {
    return this.packages.get(id);
  }
}
