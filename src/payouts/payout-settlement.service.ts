import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventPublisher } from '../events/event.publisher';
import { randomUUID } from 'crypto';

const RULE_APPLIED_ID = 'GOVERNANCE-EQ-v1';

@Injectable()
export class PayoutSettlementService {
  private readonly logger = new Logger(PayoutSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async processPayoutRequest(payoutRequestId: string): Promise<void> {
    const request = await this.prisma.payoutRequest.findUnique({
      where: { id: payoutRequestId },
    });

    if (!request) {
      throw new NotFoundException(
        `PayoutRequest ${payoutRequestId} not found`,
      );
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `PayoutRequest ${payoutRequestId} is not in PENDING status`,
      );
    }

    const correlationId = `psett_${randomUUID()}`;
    const requestWithMethod = { ...request, method: String(request.method) };

    if (requestWithMethod.method === 'CRYPTO_NOWPAYMENTS') {
      await this.processNowPayments(requestWithMethod, correlationId);
    } else {
      await this.queueManual(requestWithMethod, correlationId);
    }
  }

  private async processNowPayments(
    request: { id: string; creator_id: string; amount_cents: number; method: string },
    correlationId: string,
  ): Promise<void> {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'NOWPAYMENTS_API_KEY not configured - queuing as manual fallback',
      );
      await this.queueManual(request, correlationId);
      return;
    }

    // NOWPayments API stub - wire real HTTP call here when key is provisioned
    this.logger.log(
      `NOWPayments stub: would send ${request.amount_cents} cents for creator ${request.creator_id}`,
    );

    const settlement = await this.prisma.payoutSettlement.create({
      data: {
        payout_request_id: request.id,
        method: 'CRYPTO_NOWPAYMENTS',
        status: 'PROCESSING',
        external_ref: `nowpayments_stub_${randomUUID()}`,
        rule_applied_id: RULE_APPLIED_ID,
        correlation_id: correlationId,
      },
    });

    this.eventPublisher.publish({
      type: 'payout.settled',
      aggregateId: request.id,
      payload: {
        payoutRequestId: request.id,
        settlementId: settlement.id,
        method: 'CRYPTO_NOWPAYMENTS',
        settledAt: new Date().toISOString(),
      },
      emittedAt: new Date().toISOString(),
    });
  }

  private async queueManual(
    request: { id: string; creator_id: string; amount_cents: number; method: string },
    correlationId: string,
  ): Promise<void> {
    await this.prisma.payoutSettlement.create({
      data: {
        payout_request_id: request.id,
        method: request.method as never,
        status: 'PENDING_MANUAL',
        rule_applied_id: RULE_APPLIED_ID,
        correlation_id: correlationId,
      },
    });

    this.logger.log(
      `Queued manual payout for ops team: request ${request.id}`,
    );
  }
}
