import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from './movie.entity';
import { ApiTags } from '@nestjs/swagger';

@Controller('movies')
@ApiTags('movies')
export class MoviesController {
  constructor(
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  @Get()
  findAll() {
    return this.movieRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }
}
