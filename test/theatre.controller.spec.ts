import { BadRequestException } from '@nestjs/common';
import { TheatreController } from '../src/theatre/theatre.controller';

const makeService = () => ({
  createShow: jest.fn().mockResolvedValue({ id: 'show-1' }),
  recordLingerEvent: jest.fn().mockResolvedValue({ id: 'linger-1' }),
  settleBlockPayout: jest.fn().mockResolvedValue({ showId: 'show-1' }),
  calculateBlockPayout: jest
    .fn()
    .mockResolvedValue(new Map([['creator-1', 420]])),
});

describe('TheatreController', () => {
  it('rejects createShow without the x-creator-id header', async () => {
    const service = makeService();
    const controller = new TheatreController(service as never);

    await expect(
      controller.createShow('' as never, { ticketPriceCents: 500 }),
    ).rejects.toThrow(BadRequestException);
    expect(service.createShow).not.toHaveBeenCalled();
  });

  it('forwards createShow to the service with creatorId', async () => {
    const service = makeService();
    const controller = new TheatreController(service as never);

    await controller.createShow('creator-1', { ticketPriceCents: 500 });

    expect(service.createShow).toHaveBeenCalledWith({
      creatorId: 'creator-1',
      ticketPriceCents: 500,
    });
  });

  it('forwards recordLinger with show id from the path', async () => {
    const service = makeService();
    const controller = new TheatreController(service as never);

    await controller.recordLinger('show-1', {
      guestId: 'guest-1',
      creatorId: 'creator-1',
      viewerSeconds: 120,
    });

    expect(service.recordLingerEvent).toHaveBeenCalledWith({
      showId: 'show-1',
      guestId: 'guest-1',
      creatorId: 'creator-1',
      viewerSeconds: 120,
    });
  });

  it('forwards settleShow to the service', async () => {
    const service = makeService();
    const controller = new TheatreController(service as never);

    const result = await controller.settleShow('show-1');

    expect(service.settleBlockPayout).toHaveBeenCalledWith('show-1');
    expect(result).toEqual({ showId: 'show-1' });
  });

  it('serializes the payout preview Map into a plain object', async () => {
    const service = makeService();
    const controller = new TheatreController(service as never);

    const result = await controller.payoutPreview('show-1');

    expect(service.calculateBlockPayout).toHaveBeenCalledWith('show-1');
    expect(result).toEqual({ showId: 'show-1', payouts: { 'creator-1': 420 } });
  });
});
