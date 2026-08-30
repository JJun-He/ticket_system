import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { AppException } from '../common/errors/app.exception';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
@ApiTags('bookings')
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    description: '예매 요청 재시도를 안전하게 처리하기 위한 UUID',
    required: true,
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateBookingDto,
  ) {
    if (!idempotencyKey) {
      throw new AppException('BOOKING_IDEMPOTENCY_KEY_REQUIRED');
    }

    return this.bookingsService.create(user.sub, dto, idempotencyKey);
  }

  @Get()
  findMine(@CurrentUser() user: JwtPayload) {
    return this.bookingsService.findByUser(user.sub);
  }
}
