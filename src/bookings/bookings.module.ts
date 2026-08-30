import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BookingSeat } from './booking-seat.entity';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingSeat]), AuthModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
