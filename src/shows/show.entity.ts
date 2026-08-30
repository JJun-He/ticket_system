import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Movie } from '../movies/movie.entity';
import { ShowSeat } from './show-seat.entity';

@Entity('shows')
@Index('idx_shows_movie_starts_at', ['movieId', 'startsAt'])
export class Show {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'movie_id', type: 'int' })
  movieId!: number;

  @ManyToOne(() => Movie, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'movie_id' })
  movie!: Movie;

  @Column({ type: 'varchar', length: 100 })
  auditorium!: string;

  @Column({
    name: 'starts_at',
    type: 'timestamptz',
  })
  startsAt!: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @OneToMany(() => ShowSeat, (showSeat) => showSeat.show)
  showSeats!: ShowSeat[];
}
