import { BadRequestException } from '@nestjs/common';
import { PayoutsController } from '../src/payouts/payouts.controller';

const makePreferenceService = () => ({
  upsert: jest.fn().mockResolvedValue({ id: 'pref-1' }),
  getByCreatorId: jest.fn().mockResolvedValue({ id: 'pref-1' }),
});

const makeRequestService = () => ({
  submit: jest.fn().mockResolvedValue({ id: 'req-1' }),
  listByCreator: jest.fn().mockResolvedValue([{ id: 'req-1' }]),
  getById: jest.fn().mockResolvedValue({ id: 'req-1' }),
});

describe('PayoutsController', () => {
  it('rejects requests missing the x-creator-id header', async () => {
    const controller = new PayoutsController(
      makePreferenceService() as never,
      makeRequestService() as never,
    );

    await expect(
      controller.getPreference('' as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('forwards setPreference to the preference service with creatorId', async () => {
    const preference = makePreferenceService();
    const controller = new PayoutsController(
      preference as never,
      makeRequestService() as never,
    );

    await controller.setPreference('creator-1', {
      preferredMethod: 'E_TRANSFER',
      etransferEmail: 'c@example.com',
    });

    expect(preference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: 'creator-1',
        preferredMethod: 'E_TRANSFER',
      }),
    );
  });

  it('forwards getPreference to the preference service', async () => {
    const preference = makePreferenceService();
    const controller = new PayoutsController(
      preference as never,
      makeRequestService() as never,
    );

    const result = await controller.getPreference('creator-1');

    expect(preference.getByCreatorId).toHaveBeenCalledWith('creator-1');
    expect(result).toEqual({ id: 'pref-1' });
  });

  it('forwards submitRequest with parsed body fields', async () => {
    const request = makeRequestService();
    const controller = new PayoutsController(
      makePreferenceService() as never,
      request as never,
    );

    await controller.submitRequest('creator-1', {
      amountCents: 7500,
      method: 'E_TRANSFER',
    });

    expect(request.submit).toHaveBeenCalledWith({
      creatorId: 'creator-1',
      amountCents: 7500,
      method: 'E_TRANSFER',
    });
  });

  it('forwards listRequests to the request service', async () => {
    const request = makeRequestService();
    const controller = new PayoutsController(
      makePreferenceService() as never,
      request as never,
    );

    const result = await controller.listRequests('creator-1');

    expect(request.listByCreator).toHaveBeenCalledWith('creator-1');
    expect(result).toHaveLength(1);
  });

  it('forwards getRequest with id and creatorId', async () => {
    const request = makeRequestService();
    const controller = new PayoutsController(
      makePreferenceService() as never,
      request as never,
    );

    await controller.getRequest('req-1', 'creator-1');

    expect(request.getById).toHaveBeenCalledWith('req-1', 'creator-1');
  });

  it('rejects submitRequest without creatorId before touching the service', async () => {
    const request = makeRequestService();
    const controller = new PayoutsController(
      makePreferenceService() as never,
      request as never,
    );

    await expect(
      controller.submitRequest('' as never, { amountCents: 7500, method: 'E_TRANSFER' }),
    ).rejects.toThrow(BadRequestException);
    expect(request.submit).not.toHaveBeenCalled();
  });
});
