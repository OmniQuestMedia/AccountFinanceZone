import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TheatrePayoutService } from '../src/theatre/theatre-payout.service';

const mockLedger = {
  appendEntry: jest.fn().mockReturnValue({ id: 'le-1' }),
};

const mockPublisher = { publish: jest.fn() };

const mockCompliance = {
  evaluate: jest.fn().mockReturnValue({ approved: true }),
};

const makeShow = (overrides: Record<string, unknown> = {}) => ({
  id: 'show-1',
  creator_id: 'creator-1',
  ticket_price_cents: 500,
  block_start_at: new Date(),
  block_end_at: null,
  status: 'ACTIVE',
  correlation_id: 'show_1',
  created_at: new Date(),
  tickets: [],
  linger_events: [],
  ...overrides,
});

const makePrisma = (show: ReturnType<typeof makeShow> | null = makeShow()) => ({
  theatreShow: {
    create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'show-1', ...args.data }),
    ),
    findUnique: jest.fn().mockResolvedValue(show),
    update: jest.fn().mockResolvedValue(show ? { ...show, status: 'SETTLED' } : null),
    updateMany: jest.fn().mockResolvedValue({ count: show ? 1 : 0 }),
  },
  lingerEvent: {
    create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'le-1', ...args.data }),
    ),
  },
});

describe('TheatrePayoutService', () => {
  it('rejects non-positive ticketPriceCents', async () => {
    const prisma = makePrisma();
    const service = new TheatrePayoutService(
      prisma as never,
      mockLedger as never,
      mockPublisher as never,
      mockCompliance as never,
    );

    await expect(
      service.createShow({ creatorId: 'c1', ticketPriceCents: 0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects non-positive viewerSeconds', async () => {
    const prisma = makePrisma();
    const service = new TheatrePayoutService(
      prisma as never,
      mockLedger as never,
      mockPublisher as never,
      mockCompliance as never,
    );

    await expect(
      service.recordLingerEvent({
        showId: 'show-1',
        guestId: 'g1',
        creatorId: 'c1',
        viewerSeconds: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects linger event on non-ACTIVE show', async () => {
    const prisma = makePrisma(makeShow({ status: 'SETTLED' }));
    const service = new TheatrePayoutService(
      prisma as never,
      mockLedger as never,
      mockPublisher as never,
      mockCompliance as never,
    );

    await expect(
      service.recordLingerEvent({
        showId: 'show-1',
        guestId: 'g1',
        creatorId: 'c1',
        viewerSeconds: 120,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('calculates payout proportional to linger seconds using summed ticket prices', async () => {
    const show = makeShow({
      tickets: [
        { id: 't1', price_cents: 500 },
        { id: 't2', price_cents: 500 },
      ],
      linger_events: [
        { creator_id: 'c1', viewer_seconds: 60 },
        { creator_id: 'c2', viewer_seconds: 40 },
      ],
    });
    const prisma = makePrisma(show);
    const service = new TheatrePayoutService(
      prisma as never,
      mockLedger as never,
      mockPublisher as never,
      mockCompliance as never,
    );

    const payouts = await service.calculateBlockPayout('show-1');
    // total = 1000, pool = 700, c1 = floor(700*60/100)=420, c2 = floor(700*40/100)=280
    expect(payouts.get('c1')).toBe(420);
    expect(payouts.get('c2')).toBe(280);
  });

  it('returns empty map when no linger events', async () => {
    const service = new TheatrePayoutService(
      makePrisma() as never,
      mockLedger as never,
      mockPublisher as never,
      mockCompliance as never,
    );

    const payouts = await service.calculateBlockPayout('show-1');
    expect(payouts.size).toBe(0);
  });

  it('throws BadRequestException for concurrent settle attempt', async () => {
    const prisma = makePrisma(makeShow({ status: 'SETTLING' }));
    (prisma.theatreShow.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const service = new TheatrePayoutService(
      prisma as never,
      mockLedger as never,
      mockPublisher as never,
      mockCompliance as never,
    );

    await expect(service.settleBlockPayout('show-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('appends ledger credits and emits event on settle', async () => {
    const show = makeShow({
      tickets: [{ id: 't1', price_cents: 1000 }],
      linger_events: [{ creator_id: 'c1', viewer_seconds: 100 }],
    });
    const prisma = makePrisma(show);
    const ledger = { appendEntry: jest.fn().mockReturnValue({ id: 'le-1' }) };
    const publisher = { publish: jest.fn() };
    const service = new TheatrePayoutService(
      prisma as never,
      ledger as never,
      publisher as never,
      mockCompliance as never,
    );

    const result = await service.settleBlockPayout('show-1');

    expect(ledger.appendEntry).toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'theatre.block.settled' }),
    );
    expect(result.ledgerEntries).toHaveLength(1);
  });

  it('marks the show FAILED and rethrows when compliance rejects a payout', async () => {
    const show = makeShow({
      tickets: [{ id: 't1', price_cents: 1000 }],
      linger_events: [{ creator_id: 'c1', viewer_seconds: 100 }],
    });
    const prisma = makePrisma(show);
    const ledger = { appendEntry: jest.fn() };
    const publisher = { publish: jest.fn() };
    const compliance = {
      evaluate: jest
        .fn()
        .mockReturnValue({ approved: false, reason: 'AML hold' }),
    };
    const service = new TheatrePayoutService(
      prisma as never,
      ledger as never,
      publisher as never,
      compliance as never,
    );

    await expect(service.settleBlockPayout('show-1')).rejects.toThrow(
      BadRequestException,
    );

    // Show must not be wedged in SETTLING; it should be marked FAILED
    expect(prisma.theatreShow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(ledger.appendEntry).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for unknown show', async () => {
    const prisma = makePrisma(null);
    (prisma.theatreShow.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const service = new TheatrePayoutService(
      prisma as never,
      mockLedger as never,
      mockPublisher as never,
      mockCompliance as never,
    );

    await expect(service.settleBlockPayout('nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });
});
