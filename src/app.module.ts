import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesModule } from './movies/movie.module';
import { ShowsModule } from './shows/shows.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { validateEnvironment } from './config/env.validation';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        database: config.getOrThrow<string>('DB_NAME'),
        username: config.getOrThrow<string>('DB_USER'),
        password: config.getOrThrow<string>('DB_PASSWORD'),

        extra: {
          max: config.getOrThrow<number>('DB_POOL_MAX'),
          connectionTimeoutMillis: config.getOrThrow<number>(
            'DB_CONNECTION_TIMEOUT_MS',
          ),
          idleTimeoutMillis: config.getOrThrow<number>('DB_IDLE_TIMEOUT_MS'),
          statement_timeout: config.getOrThrow<number>(
            'DB_STATEMENT_TIMEOUT_MS',
          ),
          idle_in_transaction_session_timeout: config.getOrThrow<number>(
            'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS',
          ),
          application_name: config.getOrThrow<string>('DB_APPLICATION_NAME'),
        },

        autoLoadEntities: true,

        // 스키마 변경은 migration으로만 관리한다.
        synchronize: false,
      }),
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        skipIf: () => config.get<string>('NODE_ENV') === 'test',
        throttlers: [
          {
            ttl: config.getOrThrow<number>('THROTTLE_TTL_MS'),
            limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
          },
        ],
      }),
    }),

    MoviesModule,
    ShowsModule,
    AuthModule,
    BookingsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule {}
