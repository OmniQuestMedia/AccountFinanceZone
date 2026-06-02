import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { EventPublisher } from '../events/event.publisher';
import { ComplianceService } from '../compliance/compliance.service';
import { randomUUID } from 'crypto';

const CREATOR_SHARE_BPS = 7000; // 70%
const RULE_APPLIED_ID = 'GOVERNANCE-EQ-v1';

export interface CreateShowInput {
  creatorId: string;
  ticketPriceCents: number;
}

export interface RecordLingerEventInput {
  showId: string;
  guestId: string;
  creatorId: string;
  viewerSeconds: number;
}

@Injectable()
export class TheatrePayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly eventPublisher: EventPublisher,
    private readonly compliance: ComplianceService,
  ) {}

  async createShow(input: CreateShowInput) {
    if (!Number.isInteger(input.ticketPriceCents) || input.ticketPriceCents <= 0) {
      throw new BadRequestException('ticketPriceCents must be a positive integer');
    }

    return this.prisma.theatreShow.create({
      data: {
        creator_id: input.creatorId,
        ticket_price_cents: input.ticketPriceCents,
        block_start_at: new Date(),
        status: 'ACTIVE',
        correlation_id: `show_${randomUUID()}`,
      },
    });
  }

  async recordLingerEvent(input: RecordLingerEventInput) {
    if (!Number.isInteger(input.viewerSeconds) || input.viewerSeconds <= 0) {
      throw new BadRequestException('viewerSeconds must be a positive integer');
    }

    const show = await this.prisma.theatreShow.findUnique({
      where: { id: input.showId },
    });

    if (!show) {
      throw new NotFoundException(`TheatreShow ${input.showId} not found`);
    }

    if (show.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Show ${input.showId} is not active (status: ${show.status})`,
      );
    }

    return this.prisma.lingerEvent.create({
      data: {
        show_id: input.showId,
        guest_id: input.guestId,
        creator_id: input.creatorId,
        viewer_seconds: input.viewerSeconds,
        correlation_id: `linger_${randomUUID()}`,
      },
    });
  }

  async calculateBlockPayout(showId: string): Promise<Map<string, number>> {
    const show = await this.prisma.theatreShow.findUnique({
      where: { id: showId },
      include: { tickets: true, linger_events: true },
    });

    if (!show) {
      throw new NotFoundException(`TheatreShow ${showId} not found`);
    }

    // Sum actual ticket prices to handle variable pricing scenarios
    const totalRevenueCents = show.tickets.reduce(
      (sum, t) => sum + t.price_cents,
      0,
    );
    const creatorPoolCents = Math.floor(
      (totalRevenueCents * CREATOR_SHARE_BPS) / 10000,
    );

    const totalSeconds = show.linger_events.reduce(
      (sum, e) => sum + e.viewer_seconds,
      0,
    );

    const payouts = new Map<string, number>();

    if (totalSeconds === 0) return payouts;

    const secondsByCreator = new Map<string, number>();
    for (const event of show.linger_events) {
      secondsByCreator.set(
        event.creator_id,
        (secondsByCreator.get(event.creator_id) ?? 0) + event.viewer_seconds,
      );
    }

    for (const [creatorId, seconds] of secondsByCreator.entries()) {
      const share = Math.floor((creatorPoolCents * seconds) / totalSeconds);
      payouts.set(creatorId, share);
    }

    return payouts;
  }

  async settleBlockPayout(showId: string) {
    // Atomically advance status ACTIVE -> SETTLING to prevent concurrency double-pay
    const updated = await this.prisma.theatreShow.updateMany({
      where: { id: showId, status: 'ACTIVE' },
      data: { status: 'SETTLING' },
    });

    if (updated.count === 0) {
      const show = await this.prisma.theatreShow.findUnique({
        where: { id: showId },
      });
      if (!show) {
        throw new NotFoundException(`TheatreShow ${showId} not found`);
      }
      throw new BadRequestException(
        `Show ${showId} is not in ACTIVE status - already settled?`,
      );
    }

    const payouts = await this.calculateBlockPayout(showId);
    const auditTraceId = `audit_theatre_${randomUUID()}`;

    const ledgerEntries: Array<{ creatorId: string; amountCents: number; entryId: string }> = [];

    for (const [creatorId, amountCents] of payouts.entries()) {
      if (amountCents <= 0) continue;

      const complianceDecision = this.compliance.evaluate({
        operation: 'PAYOUT',
        accountId: creatorId,
        amountMinor: BigInt(amountCents),
        currency: 'CAD',
        residencyRegion: 'CA',
      });

      if (!complianceDecision.approved) {
        throw new BadRequestException(
          `Compliance check failed for creator ${creatorId}: ${complianceDecision.reason}`,
        );
      }

      const entry = this.ledger.appendEntry({
        accountId: creatorId,
        entryType: 'CREDIT',
        amountMinor: BigInt(amountCents),
        currency: 'CAD',
        context: { ruleAppliedId: RULE_APPLIED_ID, auditTraceId },
      });

      ledgerEntries.push({ creatorId, amountCents, entryId: entry.id });
    }

    await this.prisma.theatreShow.update({
      where: { id: showId },
      data: {
        block_end_at: new Date(),
        status: 'SETTLED',
      },
    });

    const payoutMap = Object.fromEntries(
      ledgerEntries.map((e) => [e.creatorId, e.amountCents]),
    );

    this.eventPublisher.publish({
      type: 'theatre.block.settled',
      aggregateId: showId,
      payload: { showId, payouts: payoutMap },
      emittedAt: new Date().toISOString(),
    });

    return { showId, ledgerEntries, payouts: payoutMap };
  }
}
