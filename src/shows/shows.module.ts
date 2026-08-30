import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { Seat } from './seat.entity';
import { Show } from './show.entity';
import { ShowSeat } from './show-seat.entity';
import { ShowsController } from './shows.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Movie, Show, Seat, ShowSeat])],
  controllers: [ShowsController],
})
export class ShowsModule {}
