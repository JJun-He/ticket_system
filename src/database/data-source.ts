import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../auth/user.entity';
import { BookingSeat } from '../bookings/booking-seat.entity';
import { Booking } from '../bookings/booking.entity';
import { Movie } from '../movies/movie.entity';
import { Seat } from '../shows/seat.entity';
import { ShowSeat } from '../shows/show-seat.entity';
import { Show } from '../shows/show.entity';
import { InitialSchema1788060000000 } from './migrations/1788060000000-initial-schema';
import { HardenBookingSchema1788063600000 } from './migrations/1788063600000-harden-booking-schema';
import { TuneBookingQueries1788067200000 } from './migrations/1788067200000-tune-booking-queries';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  database: process.env.DB_NAME ?? 'ticket_system',
  username: process.env.DB_USER ?? 'ticket_user',
  password: process.env.DB_PASSWORD ?? 'ticket_password',
  entities: [User, Movie, Show, Seat, ShowSeat, Booking, BookingSeat],
  migrations: [
    InitialSchema1788060000000,
    HardenBookingSchema1788063600000,
    TuneBookingQueries1788067200000,
  ],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
