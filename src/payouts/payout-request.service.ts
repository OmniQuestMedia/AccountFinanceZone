import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../events/event.publisher';
import { randomUUID } from 'crypto';

const MINIMUM_PAYOUT_CENTS = 5000; // $50.00 CAD
const RULE_APPLIED_ID = 'GOVERNANCE-EQ-v1';

const VALID_PAYOUT_METHODS = new Set([
  'DIRECT_DEPOSIT',
  'E_TRANSFER',
  'WIRE_TRANSFER',
  'CHECK_BY_MAIL',
  'CRYPTO_NOWPAYMENTS',
]);

export interface SubmitPayoutRequestInput {
  creatorId: string;
  amountCents: number;
  method: string;
}

@Injectable()
export class PayoutRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async submit(input: SubmitPayoutRequestInput) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive integer');
    }

    if (input.amountCents < MINIMUM_PAYOUT_CENTS) {
      throw new BadRequestException(
        `Minimum payout amount is $${MINIMUM_PAYOUT_CENTS / 100} CAD`,
      );
    }

    if (!VALID_PAYOUT_METHODS.has(input.method)) {
      throw new BadRequestException(`Invalid payout method: ${input.method}`);
    }

    const activeHold = await this.prisma.payoutRequest.findFirst({
      where: {
        creator_id: input.creatorId,
        status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] },
      },
    });

    if (activeHold) {
      throw new BadRequestException(
        'A payout request is already in progress. Please wait for it to complete.',
      );
    }

    const correlationId = `preq_${randomUUID()}`;

    const request = await this.prisma.payoutRequest.create({
      data: {
        creator_id: input.creatorId,
        amount_cents: input.amountCents,
        currency: 'CAD',
        method: input.method as never,
        status: 'PENDING',
        rule_applied_id: RULE_APPLIED_ID,
        correlation_id: correlationId,
      },
    });

    this.eventPublisher.publish({
      type: 'payout.requested',
      aggregateId: request.id,
      payload: {
        payoutRequestId: request.id,
        creatorId: input.creatorId,
        amountCents: input.amountCents,
        method: input.method,
      },
      emittedAt: new Date().toISOString(),
    });

    return request;
  }

  async listByCreator(creatorId: string) {
    return this.prisma.payoutRequest.findMany({
      where: { creator_id: creatorId },
      orderBy: { created_at: 'desc' },
    });
  }

  async getById(id: string, creatorId: string) {
    const request = await this.prisma.payoutRequest.findFirst({
      where: { id, creator_id: creatorId },
      include: { settlements: true },
    });

    if (!request) {
      throw new NotFoundException(`Payout request ${id} not found`);
    }

    return request;
  }
}
