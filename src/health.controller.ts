import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiTags } from '@nestjs/swagger';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'ticket-system',
    };
  }

  @Get('db')
  async getDatabaseHealth() {
    await this.dataSource.query('SELECT 1');

    return {
      status: 'ok',
      database: 'connected',
    };
  }
}
