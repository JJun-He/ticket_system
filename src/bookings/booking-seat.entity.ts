import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Booking } from './booking.entity';
import { ShowSeat } from '../shows/show-seat.entity';

@Entity('booking_seats')
@Unique('uq_booking_show_seat', ['showId', 'seatId'])
@Index('idx_booking_seats_booking_id', ['bookingId'])
export class BookingSeat {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'booking_id', type: 'int' })
  bookingId!: number;

  @ManyToOne(() => Booking, (booking) => booking.seats, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'show_id', type: 'int' })
  showId!: number;

  @Column({ name: 'seat_id', type: 'int' })
  seatId!: number;

  @ManyToOne(() => ShowSeat, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'show_id', referencedColumnName: 'showId' },
    { name: 'seat_id', referencedColumnName: 'seatId' },
  ])
  showSeat!: ShowSeat;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
