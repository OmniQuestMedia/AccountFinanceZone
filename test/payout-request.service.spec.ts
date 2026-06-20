import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutRequestService } from '../src/payouts/payout-request.service';

const mockPublisher = { publish: jest.fn() };

const makePrisma = (activeHold: Record<string, unknown> | null = null) => ({
  payoutRequest: {
    findFirst: jest.fn().mockResolvedValue(activeHold),
    create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'req-1', ...args.data }),
    ),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

describe('PayoutRequestService', () => {
  it('rejects non-integer amountCents', async () => {
    const service = new PayoutRequestService(
      makePrisma() as never,
      mockPublisher as never,
    );

    await expect(
      service.submit({ creatorId: 'c1', amountCents: 50.5, method: 'E_TRANSFER' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects amount below minimum $50', async () => {
    const service = new PayoutRequestService(
      makePrisma() as never,
      mockPublisher as never,
    );

    await expect(
      service.submit({ creatorId: 'c1', amountCents: 4999, method: 'E_TRANSFER' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid payout method', async () => {
    const service = new PayoutRequestService(
      makePrisma() as never,
      mockPublisher as never,
    );

    await expect(
      service.submit({ creatorId: 'c1', amountCents: 5000, method: 'PAYPAL' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when active hold exists', async () => {
    const service = new PayoutRequestService(
      makePrisma({ id: 'existing', status: 'PENDING' }) as never,
      mockPublisher as never,
    );

    await expect(
      service.submit({ creatorId: 'c1', amountCents: 5000, method: 'E_TRANSFER' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates request and publishes event for valid input', async () => {
    const prisma = makePrisma();
    const publisher = { publish: jest.fn() };
    const service = new PayoutRequestService(prisma as never, publisher as never);

    const result = await service.submit({
      creatorId: 'c1',
      amountCents: 7500,
      method: 'E_TRANSFER',
    });

    expect(result).toMatchObject({ amount_cents: 7500, currency: 'CAD' });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payout.requested' }),
    );
  });

  it('lists payout requests for a creator newest-first', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'req-2' }, { id: 'req-1' }]);
    const prisma = { payoutRequest: { findMany } };
    const service = new PayoutRequestService(
      prisma as never,
      mockPublisher as never,
    );

    const result = await service.listByCreator('c1');

    expect(findMany).toHaveBeenCalledWith({
      where: { creator_id: 'c1' },
      orderBy: { created_at: 'desc' },
    });
    expect(result).toHaveLength(2);
  });

  it('returns a single payout request scoped to the creator', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'req-1', settlements: [] });
    const prisma = { payoutRequest: { findFirst } };
    const service = new PayoutRequestService(
      prisma as never,
      mockPublisher as never,
    );

    const result = await service.getById('req-1', 'c1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'req-1', creator_id: 'c1' },
      include: { settlements: true },
    });
    expect(result).toMatchObject({ id: 'req-1' });
  });

  it('throws NotFoundException when the request is not owned by the creator', async () => {
    const prisma = {
      payoutRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PayoutRequestService(
      prisma as never,
      mockPublisher as never,
    );

    await expect(service.getById('req-1', 'someone-else')).rejects.toThrow(
      NotFoundException,
    );
  });
});
