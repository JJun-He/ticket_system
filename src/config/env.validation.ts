import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV!: Environment;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DB_HOST!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT!: number;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

  @IsString()
  @IsNotEmpty()
  DB_USER!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  DB_POOL_MAX!: number;

  @IsInt()
  @Min(100)
  @Max(60_000)
  DB_CONNECTION_TIMEOUT_MS!: number;

  @IsInt()
  @Min(1_000)
  @Max(300_000)
  DB_IDLE_TIMEOUT_MS!: number;

  @IsInt()
  @Min(1_000)
  @Max(60_000)
  DB_STATEMENT_TIMEOUT_MS!: number;

  @IsInt()
  @Min(1_000)
  @Max(60_000)
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS!: number;

  @IsString()
  @IsNotEmpty()
  DB_APPLICATION_NAME!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsBoolean()
  ENABLE_SWAGGER!: boolean;

  @IsInt()
  @Min(1_000)
  THROTTLE_TTL_MS!: number;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT!: number;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const nodeEnvironment = config.NODE_ENV ?? Environment.DEVELOPMENT;
  const normalizedConfig = {
    ...config,
    NODE_ENV: nodeEnvironment,
    PORT: Number(config.PORT ?? 3000),
    DB_HOST: config.DB_HOST ?? 'localhost',
    DB_PORT: Number(config.DB_PORT ?? 5433),
    DB_NAME: config.DB_NAME ?? 'ticket_system',
    DB_USER: config.DB_USER ?? 'ticket_user',
    DB_PASSWORD: config.DB_PASSWORD,
    DB_POOL_MAX: Number(config.DB_POOL_MAX ?? 10),
    DB_CONNECTION_TIMEOUT_MS: Number(config.DB_CONNECTION_TIMEOUT_MS ?? 3_000),
    DB_IDLE_TIMEOUT_MS: Number(config.DB_IDLE_TIMEOUT_MS ?? 10_000),
    DB_STATEMENT_TIMEOUT_MS: Number(config.DB_STATEMENT_TIMEOUT_MS ?? 5_000),
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: Number(
      config.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS ?? 10_000,
    ),
    DB_APPLICATION_NAME: config.DB_APPLICATION_NAME ?? 'ticket-system',
    JWT_SECRET: config.JWT_SECRET,
    ENABLE_SWAGGER: parseBoolean(
      config.ENABLE_SWAGGER,
      nodeEnvironment !== Environment.PRODUCTION,
    ),
    THROTTLE_TTL_MS: Number(config.THROTTLE_TTL_MS ?? 60_000),
    THROTTLE_LIMIT: Number(config.THROTTLE_LIMIT ?? 100),
  };
  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    normalizedConfig,
  );
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`환경변수 설정이 올바르지 않습니다: ${errors.toString()}`);
  }

  if (
    validatedConfig.NODE_ENV === Environment.PRODUCTION &&
    validatedConfig.JWT_SECRET.length < 32
  ) {
    throw new Error('production 환경의 JWT_SECRET은 32자 이상이어야 합니다.');
  }

  return validatedConfig;
}

function parseBoolean(value: unknown, defaultValue: boolean): unknown {
  if (value === undefined) {
    return defaultValue;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return value;
}
