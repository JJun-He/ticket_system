import { HttpStatus } from '@nestjs/common';

interface ErrorDefinition {
  status: HttpStatus;
  message: string;
}

export const ERROR_DEFINITIONS = {
  AUTH_EMAIL_ALREADY_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: '이미 가입된 이메일입니다.',
  },
  AUTH_INVALID_CREDENTIALS: {
    status: HttpStatus.UNAUTHORIZED,
    message: '이메일 또는 비밀번호가 올바르지 않습니다.',
  },
  AUTH_TOKEN_REQUIRED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Bearer 토큰이 필요합니다.',
  },
  AUTH_TOKEN_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    message: '유효하지 않은 토큰입니다.',
  },
  BOOKING_IDEMPOTENCY_KEY_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Idempotency-Key 헤더가 필요합니다.',
  },
  BOOKING_IDEMPOTENCY_KEY_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Idempotency-Key는 UUID 형식이어야 합니다.',
  },
  BOOKING_SHOW_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '상영 회차를 찾을 수 없습니다.',
  },
  BOOKING_SHOW_ALREADY_STARTED: {
    status: HttpStatus.CONFLICT,
    message: '이미 시작된 상영은 예매할 수 없습니다.',
  },
  BOOKING_SEAT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '상영 회차에 존재하지 않는 좌석이 포함되어 있습니다.',
  },
  BOOKING_SEAT_ALREADY_BOOKED: {
    status: HttpStatus.CONFLICT,
    message: '이미 예매된 좌석이 포함되어 있습니다.',
  },
  BOOKING_IDEMPOTENCY_KEY_REUSED: {
    status: HttpStatus.CONFLICT,
    message: '동일한 Idempotency-Key가 다른 예매 요청에 사용되었습니다.',
  },
  BOOKING_TEMPORARILY_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: '예매 요청이 몰리고 있습니다. 잠시 후 다시 시도해주세요.',
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;
