import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutSettlementService } from '../src/payouts/payout-settlement.service';

const mockPublisher = { publish: jest.fn() };

const makeRequest = (status = 'PENDING') => ({
  id: 'req-1',
  creator_id: 'creator-1',
  amount_cents: 7500,
  currency: 'CAD',
  method: 'E_TRANSFER',
  status,
  rule_applied_id: 'GOVERNANCE-EQ-v1',
  correlation_id: 'preq_1',
  created_at: new Date(),
});

const makePrisma = (request: ReturnType<typeof makeRequest> | null, advancedCount = 1) => ({
  payoutRequest: {
    updateMany: jest.fn().mockResolvedValue({ count: advancedCount }),
    findUnique: jest.fn().mockResolvedValue(request),
    findUniqueOrThrow: jest.fn().mockResolvedValue(request),
    update: jest.fn().mockResolvedValue(
      request ? { ...request, status: 'SETTLED' } : null,
    ),
  },
  payoutSettlement: {
    create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'sett-1', ...args.data }),
    ),
  },
});

describe('PayoutSettlementService', () => {
  it('throws NotFoundException when request does not exist', async () => {
    const prisma = makePrisma(null, 0);
    const service = new PayoutSettlementService(
      prisma as never,
      mockPublisher as never,
    );

    await expect(service.processPayoutRequest('nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when status is not PENDING (concurrent duplicate)', async () => {
    const prisma = makePrisma(makeRequest('PROCESSING'), 0);
    const service = new PayoutSettlementService(
      prisma as never,
      mockPublisher as never,
    );

    await expect(service.processPayoutRequest('req-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('queues manual settlement for non-crypto method', async () => {
    const prisma = makePrisma(makeRequest());
    const service = new PayoutSettlementService(
      prisma as never,
      mockPublisher as never,
    );

    const origEnv = process.env.NOWPAYMENTS_API_KEY;
    delete process.env.NOWPAYMENTS_API_KEY;

    await service.processPayoutRequest('req-1');

    expect(prisma.payoutSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_MANUAL' }),
      }),
    );

    if (origEnv !== undefined) {
      process.env.NOWPAYMENTS_API_KEY = origEnv;
    }
  });

  it('falls back to a manual queue for crypto payouts when no API key is configured', async () => {
    const prisma = makePrisma(makeRequest());
    (prisma.payoutRequest.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      ...makeRequest(),
      method: 'CRYPTO_NOWPAYMENTS',
    });
    const publisher = { publish: jest.fn() };
    const service = new PayoutSettlementService(prisma as never, publisher as never);

    const origNowKey = process.env.NOWPAYMENTS_API_KEY;
    delete process.env.NOWPAYMENTS_API_KEY;

    await service.processPayoutRequest('req-1');

    // No external key => no SETTLED transition, queued as PENDING_MANUAL instead
    expect(prisma.payoutSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_MANUAL' }),
      }),
    );
    expect(publisher.publish).not.toHaveBeenCalled();

    if (origNowKey !== undefined) {
      process.env.NOWPAYMENTS_API_KEY = origNowKey;
    }
  });

  it('advances request status to SETTLED after NOWPayments stub', async () => {
    const prisma = makePrisma(makeRequest());
    (prisma.payoutRequest.findUniqueOrThrow as jest.Mock).mockResolvedValue(
      makeRequest('PROCESSING'),
    );
    const publisher = { publish: jest.fn() };
    const service = new PayoutSettlementService(prisma as never, publisher as never);

    const origNowKey = process.env.NOWPAYMENTS_API_KEY;
    process.env.NOWPAYMENTS_API_KEY = 'test-key';

    const cryptoRequest = makeRequest();
    (prisma.payoutRequest.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      ...cryptoRequest,
      method: 'CRYPTO_NOWPAYMENTS',
    });

    await service.processPayoutRequest('req-1');

    expect(prisma.payoutRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SETTLED' }),
      }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payout.settled' }),
    );

    if (origNowKey !== undefined) {
      process.env.NOWPAYMENTS_API_KEY = origNowKey;
    } else {
      delete process.env.NOWPAYMENTS_API_KEY;
    }
  });
});
