import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ShowSeat } from './show-seat.entity';

@Entity('seats')
@Unique('uq_seat_position', ['rowLabel', 'seatNumber'])
export class Seat {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    name: 'row_label',
    type: 'varchar',
    length: 10,
  })
  rowLabel!: string;

  @Column({
    name: 'seat_number',
    type: 'int',
  })
  seatNumber!: number;

  @OneToMany(() => ShowSeat, (showSeat) => showSeat.seat)
  showSeats!: ShowSeat[];
}
