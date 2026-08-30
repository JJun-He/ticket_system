import { QueryFailedError } from 'typeorm';

export const POSTGRES_ERROR_CODE = {
  UNIQUE_VIOLATION: '23505',
  LOCK_NOT_AVAILABLE: '55P03',
} as const;

interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

interface ExpectedPostgresError {
  code: string;
  constraint?: string;
}

export function isPostgresError(
  error: unknown,
  expected: ExpectedPostgresError,
): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as PostgresDriverError | undefined;

  return (
    driverError?.code === expected.code &&
    (expected.constraint === undefined ||
      driverError.constraint === expected.constraint)
  );
}
