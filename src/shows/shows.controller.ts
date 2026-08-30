import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Show } from './show.entity';
import { ShowSeat } from './show-seat.entity';
import { ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('shows')
export class ShowsController {
  constructor(
    @InjectRepository(Show)
    private readonly showRepository: Repository<Show>,

    @InjectRepository(ShowSeat)
    private readonly showSeatRepository: Repository<ShowSeat>,
  ) {}

  @Get('movies/:movieId/shows')
  findShowsByMovie(@Param('movieId', ParseIntPipe) movieId: number) {
    return this.showRepository.find({
      where: {
        movieId,
      },
      order: {
        startsAt: 'ASC',
      },
    });
  }

  @Get('shows/:showId/seats')
  async findSeatsByShow(@Param('showId', ParseIntPipe) showId: number) {
    const showSeats = await this.showSeatRepository
      .createQueryBuilder('showSeat')
      .leftJoinAndSelect('showSeat.seat', 'seat')
      .where('showSeat.show_id = :showId', { showId })
      .orderBy('seat.row_label', 'ASC')
      .addOrderBy('seat.seat_number', 'ASC')
      .getMany();

    return showSeats.map((showSeat) => ({
      showId: showSeat.showId,
      seatId: showSeat.seatId,
      rowLabel: showSeat.seat.rowLabel,
      seatNumber: showSeat.seat.seatNumber,
      status: showSeat.status,
    }));
  }
}
