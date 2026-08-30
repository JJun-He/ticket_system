import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, tap, throwError } from 'rxjs';

interface HttpRequest {
  method: string;
  originalUrl?: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
}

interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const requestId = this.getRequestId(request.headers['x-request-id']);
    const startedAt = Date.now();

    response.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          event: 'http_request_completed',
          requestId,
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        const logEntry = {
          event: 'http_request_failed',
          requestId,
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode,
          durationMs: Date.now() - startedAt,
          errorName:
            error instanceof Error ? error.constructor.name : 'UnknownError',
        };

        if (statusCode >= 500) {
          this.logger.error(logEntry);
        } else {
          this.logger.warn(logEntry);
        }

        return throwError(() => error);
      }),
    );
  }

  private getRequestId(header: string | string[] | undefined): string {
    const candidate = Array.isArray(header) ? header[0] : header;

    if (candidate && /^[A-Za-z0-9._-]{1,100}$/.test(candidate)) {
      return candidate;
    }

    return randomUUID();
  }
}
