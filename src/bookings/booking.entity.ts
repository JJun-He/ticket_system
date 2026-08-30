import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Show } from '../shows/show.entity';
import { BookingSeat } from './booking-seat.entity';

export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
}

@Entity('bookings')
@Unique('uq_booking_user_idempotency', ['userId', 'idempotencyKey'])
@Index('idx_bookings_user_created_at', ['userId', 'createdAt'])
@Check('chk_bookings_status', `"status" IN ('CONFIRMED')`)
export class Booking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'show_id', type: 'int' })
  showId!: number;

  @ManyToOne(() => Show, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'show_id' })
  show!: Show;

  @Column({ type: 'varchar', length: 20 })
  status!: BookingStatus;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => BookingSeat, (bookingSeat) => bookingSeat.booking)
  seats!: BookingSeat[];
}
