import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Seat } from './seat.entity';
import { Show } from './show.entity';

export enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  SOLD = 'SOLD',
}

@Entity('show_seats')
@Check('chk_show_seats_status', `"status" IN ('AVAILABLE', 'SOLD')`)
export class ShowSeat {
  @PrimaryColumn({
    name: 'show_id',
    type: 'int',
  })
  showId!: number;

  @PrimaryColumn({
    name: 'seat_id',
    type: 'int',
  })
  seatId!: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: SeatStatus.AVAILABLE,
  })
  status!: SeatStatus;

  @ManyToOne(() => Show, (show) => show.showSeats, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'show_id' })
  show!: Show;

  @ManyToOne(() => Seat, (seat) => seat.showSeats, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'seat_id' })
  seat!: Seat;
}
