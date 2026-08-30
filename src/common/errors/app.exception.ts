import { HttpException } from '@nestjs/common';
import { ERROR_DEFINITIONS, ErrorCode } from './error-code';

export class AppException extends HttpException {
  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    const { status, message } = ERROR_DEFINITIONS[code];

    super(
      {
        ...details,
        statusCode: status,
        code,
        message,
      },
      status,
    );
  }
}
