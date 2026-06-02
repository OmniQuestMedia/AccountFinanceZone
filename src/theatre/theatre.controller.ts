import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { TheatrePayoutService } from './theatre-payout.service';

interface CreateShowBody {
  ticketPriceCents: number;
}

interface RecordLingerBody {
  guestId: string;
  creatorId: string;
  viewerSeconds: number;
}

@Controller('theatre/shows')
export class TheatreController {
  constructor(private readonly theatreService: TheatrePayoutService) {}

  @Post()
  async createShow(
    @Headers('x-creator-id') creatorId: string,
    @Body() body: CreateShowBody,
  ) {
    this.assertCreatorId(creatorId);
    return this.theatreService.createShow({ creatorId, ticketPriceCents: body.ticketPriceCents });
  }

  @Post(':id/linger')
  async recordLinger(
    @Param('id') showId: string,
    @Body() body: RecordLingerBody,
  ) {
    return this.theatreService.recordLingerEvent({
      showId,
      guestId: body.guestId,
      creatorId: body.creatorId,
      viewerSeconds: body.viewerSeconds,
    });
  }

  @Post(':id/settle')
  async settleShow(@Param('id') showId: string) {
    return this.theatreService.settleBlockPayout(showId);
  }

  @Get(':id/payout-preview')
  async payoutPreview(@Param('id') showId: string) {
    const payouts = await this.theatreService.calculateBlockPayout(showId);
    return { showId, payouts: Object.fromEntries(payouts) };
  }

  private assertCreatorId(creatorId: string): void {
    if (!creatorId) {
      throw new BadRequestException('x-creator-id header is required');
    }
  }
}
