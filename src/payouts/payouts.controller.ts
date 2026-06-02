import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { CreatorPayoutPreferenceService } from './creator-payout-preference.service';
import { PayoutRequestService } from './payout-request.service';

interface SetPreferenceBody {
  preferredMethod: string;
  directDepositDetails?: Record<string, unknown>;
  etransferEmail?: string;
  wireDetails?: Record<string, unknown>;
  cryptoWalletAddress?: string;
  mailingAddress?: Record<string, unknown>;
}

interface SubmitRequestBody {
  amountCents: number;
  method: string;
}

@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly preferenceService: CreatorPayoutPreferenceService,
    private readonly requestService: PayoutRequestService,
  ) {}

  @Post('preference')
  async setPreference(
    @Headers('x-creator-id') creatorId: string,
    @Body() body: SetPreferenceBody,
  ) {
    this.assertCreatorId(creatorId);
    return this.preferenceService.upsert({ creatorId, ...body });
  }

  @Get('preference')
  async getPreference(@Headers('x-creator-id') creatorId: string) {
    this.assertCreatorId(creatorId);
    return this.preferenceService.getByCreatorId(creatorId);
  }

  @Post('request')
  async submitRequest(
    @Headers('x-creator-id') creatorId: string,
    @Body() body: SubmitRequestBody,
  ) {
    this.assertCreatorId(creatorId);
    return this.requestService.submit({
      creatorId,
      amountCents: body.amountCents,
      method: body.method,
    });
  }

  @Get('requests')
  async listRequests(@Headers('x-creator-id') creatorId: string) {
    this.assertCreatorId(creatorId);
    return this.requestService.listByCreator(creatorId);
  }

  @Get('requests/:id')
  async getRequest(
    @Param('id') id: string,
    @Headers('x-creator-id') creatorId: string,
  ) {
    this.assertCreatorId(creatorId);
    return this.requestService.getById(id, creatorId);
  }

  private assertCreatorId(creatorId: string): void {
    if (!creatorId) {
      throw new BadRequestException('x-creator-id header is required');
    }
  }
}
