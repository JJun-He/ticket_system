import { Injectable, Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import {
  isPostgresError,
  POSTGRES_ERROR_CODE,
} from '../common/database/postgres-error';
import { AppException } from '../common/errors/app.exception';
import { SeatStatus } from '../shows/show-seat.entity';
import { BookingSeat } from './booking-seat.entity';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';

interface LockedShowSeatRow {
  seat_id: number;
  status: SeatStatus;
}

interface LockedShowRow {
  id: number;
  has_started: boolean;
}

interface ShowTimingRow {
  has_started: boolean;
}

interface BookingResponse {
  id: number;
  showId: number;
  seatIds: number[];
  status: BookingStatus;
  createdAt: Date;
}

interface BookingHistoryResponse extends BookingResponse {
  movie: {
    id: number;
    title: string;
  };
  show: {
    id: number;
    auditorium: string;
    startsAt: Date;
  };
  seats: Array<{
    id: number;
    rowLabel: string;
    seatNumber: number;
  }>;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(private readonly dataSource: DataSource) {}

  async create(
    userId: number,
    dto: CreateBookingDto,
    idempotencyKey: string,
  ): Promise<BookingResponse> {
    if (!isUUID(idempotencyKey)) {
      throw new AppException('BOOKING_IDEMPOTENCY_KEY_INVALID');
    }

    const seatIds = [...dto.seatIds].sort((left, right) => left - right);
    const queryRunner = this.dataSource.createQueryRunner();
    let connected = false;

    try {
      await queryRunner.connect();
      connected = true;
      await queryRunner.startTransaction('READ COMMITTED');
      await queryRunner.manager.query(`SET LOCAL lock_timeout = '3s'`);

      const existing = await this.findExisting(
        queryRunner.manager,
        userId,
        idempotencyKey,
      );

      if (existing) {
        const response = this.toResponse(existing.booking, existing.seats);
        this.assertSameRequest(response, dto.showId, seatIds);
        await queryRunner.commitTransaction();
        return response;
      }

      const [show] = (await queryRunner.manager.query(
        `
          SELECT id, starts_at <= clock_timestamp() AS has_started
          FROM shows
          WHERE id = $1
          FOR SHARE
        `,
        [dto.showId],
      )) as LockedShowRow[];

      if (!show) {
        throw new AppException('BOOKING_SHOW_NOT_FOUND');
      }

      if (show.has_started) {
        throw new AppException('BOOKING_SHOW_ALREADY_STARTED');
      }

      const lockedSeats = (await queryRunner.manager.query(
        `
          SELECT seat_id, status
          FROM show_seats
          WHERE show_id = $1
            AND seat_id = ANY($2::int[])
          ORDER BY seat_id
          FOR UPDATE
        `,
        [dto.showId, seatIds],
      )) as LockedShowSeatRow[];

      // 같은 멱등 요청이 좌석 잠금을 기다리는 동안 먼저 완료됐을 수 있다.
      const concurrentExisting = await this.findExisting(
        queryRunner.manager,
        userId,
        idempotencyKey,
      );

      if (concurrentExisting) {
        const response = this.toResponse(
          concurrentExisting.booking,
          concurrentExisting.seats,
        );
        this.assertSameRequest(response, dto.showId, seatIds);
        await queryRunner.commitTransaction();
        return response;
      }

      // 좌석 잠금을 기다린 사이 상영이 시작됐는지 DB 시각으로 다시 확인한다.
      if (await this.hasShowStarted(queryRunner.manager, dto.showId)) {
        throw new AppException('BOOKING_SHOW_ALREADY_STARTED');
      }

      if (lockedSeats.length !== seatIds.length) {
        throw new AppException('BOOKING_SEAT_NOT_FOUND');
      }

      const soldSeatIds = lockedSeats
        .filter((seat) => seat.status !== SeatStatus.AVAILABLE)
        .map((seat) => seat.seat_id);

      if (soldSeatIds.length > 0) {
        throw new AppException('BOOKING_SEAT_ALREADY_BOOKED', {
          seatIds: soldSeatIds,
        });
      }

      const bookingRepository = queryRunner.manager.getRepository(Booking);
      const bookingSeatRepository =
        queryRunner.manager.getRepository(BookingSeat);
      const booking = await bookingRepository.save(
        bookingRepository.create({
          userId,
          showId: dto.showId,
          idempotencyKey,
          status: BookingStatus.CONFIRMED,
        }),
      );

      await bookingSeatRepository.save(
        seatIds.map((seatId) =>
          bookingSeatRepository.create({
            bookingId: booking.id,
            showId: dto.showId,
            seatId,
          }),
        ),
      );

      await queryRunner.manager.query(
        `
          UPDATE show_seats
          SET status = $3
          WHERE show_id = $1
            AND seat_id = ANY($2::int[])
        `,
        [dto.showId, seatIds, SeatStatus.SOLD],
      );

      await queryRunner.commitTransaction();

      return this.toResponse(
        booking,
        seatIds.map((seatId) => ({ seatId })),
      );
    } catch (error) {
      await this.rollbackSafely(queryRunner);

      if (this.isIdempotencyUniqueViolation(error)) {
        const existing = await this.findExisting(
          this.dataSource.manager,
          userId,
          idempotencyKey,
        );

        if (existing) {
          const response = this.toResponse(existing.booking, existing.seats);
          this.assertSameRequest(response, dto.showId, seatIds);
          return response;
        }
      }

      if (this.isBookingSeatUniqueViolation(error)) {
        throw new AppException('BOOKING_SEAT_ALREADY_BOOKED', { seatIds });
      }

      if (this.isLockTimeout(error)) {
        throw new AppException('BOOKING_TEMPORARILY_UNAVAILABLE');
      }

      throw error;
    } finally {
      if (connected) {
        await this.releaseSafely(queryRunner);
      }
    }
  }

  async findByUser(userId: number): Promise<BookingHistoryResponse[]> {
    const bookings = await this.dataSource
      .getRepository(Booking)
      .createQueryBuilder('booking')
      .innerJoinAndSelect('booking.show', 'show')
      .innerJoinAndSelect('show.movie', 'movie')
      .leftJoinAndSelect('booking.seats', 'bookingSeat')
      .leftJoinAndSelect('bookingSeat.showSeat', 'showSeat')
      .leftJoinAndSelect('showSeat.seat', 'seat')
      .where('booking.user_id = :userId', { userId })
      .orderBy('booking.created_at', 'DESC')
      .addOrderBy('bookingSeat.seat_id', 'ASC')
      .getMany();

    return bookings.map((booking) => ({
      ...this.toResponse(booking, booking.seats),
      movie: {
        id: booking.show.movie.id,
        title: booking.show.movie.title,
      },
      show: {
        id: booking.show.id,
        auditorium: booking.show.auditorium,
        startsAt: booking.show.startsAt,
      },
      seats: booking.seats.map((bookingSeat) => ({
        id: bookingSeat.seatId,
        rowLabel: bookingSeat.showSeat.seat.rowLabel,
        seatNumber: bookingSeat.showSeat.seat.seatNumber,
      })),
    }));
  }

  private async findExisting(
    manager: EntityManager,
    userId: number,
    idempotencyKey: string,
  ): Promise<{ booking: Booking; seats: BookingSeat[] } | null> {
    const booking = await manager.getRepository(Booking).findOne({
      where: { userId, idempotencyKey },
    });

    if (!booking) {
      return null;
    }

    const seats = await manager.getRepository(BookingSeat).find({
      where: { bookingId: booking.id },
      order: { seatId: 'ASC' },
    });

    return { booking, seats };
  }

  private async hasShowStarted(
    manager: EntityManager,
    showId: number,
  ): Promise<boolean> {
    const [showTiming] = (await manager.query(
      `
        SELECT starts_at <= clock_timestamp() AS has_started
        FROM shows
        WHERE id = $1
      `,
      [showId],
    )) as ShowTimingRow[];

    return showTiming?.has_started ?? true;
  }

  private assertSameRequest(
    booking: BookingResponse,
    showId: number,
    seatIds: number[],
  ): void {
    const sameShow = booking.showId === showId;
    const sameSeats =
      booking.seatIds.length === seatIds.length &&
      booking.seatIds.every((seatId, index) => seatId === seatIds[index]);

    if (!sameShow || !sameSeats) {
      throw new AppException('BOOKING_IDEMPOTENCY_KEY_REUSED');
    }
  }

  private toResponse(
    booking: Booking,
    seats: Array<Pick<BookingSeat, 'seatId'>>,
  ): BookingResponse {
    return {
      id: booking.id,
      showId: booking.showId,
      seatIds: seats.map((seat) => seat.seatId).sort((a, b) => a - b),
      status: booking.status,
      createdAt: booking.createdAt,
    };
  }

  private isIdempotencyUniqueViolation(error: unknown): boolean {
    return isPostgresError(error, {
      code: POSTGRES_ERROR_CODE.UNIQUE_VIOLATION,
      constraint: 'uq_booking_user_idempotency',
    });
  }

  private isLockTimeout(error: unknown): boolean {
    return isPostgresError(error, {
      code: POSTGRES_ERROR_CODE.LOCK_NOT_AVAILABLE,
    });
  }

  private isBookingSeatUniqueViolation(error: unknown): boolean {
    return isPostgresError(error, {
      code: POSTGRES_ERROR_CODE.UNIQUE_VIOLATION,
      constraint: 'uq_booking_show_seat',
    });
  }

  private async rollbackSafely(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      return;
    }

    try {
      await queryRunner.rollbackTransaction();
    } catch (error) {
      this.logger.error({
        event: 'booking_transaction_rollback_failed',
        errorName:
          error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
  }

  private async releaseSafely(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.isReleased) {
      return;
    }

    try {
      await queryRunner.release();
    } catch (error) {
      this.logger.error({
        event: 'booking_query_runner_release_failed',
        errorName:
          error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
  }
}
