import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/app.exception';
import { JwtPayload } from './jwt-payload';

interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new AppException('AUTH_TOKEN_REQUIRED');
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      throw new AppException('AUTH_TOKEN_REQUIRED');
    }

    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token);
      return true;
    } catch {
      throw new AppException('AUTH_TOKEN_INVALID');
    }
  }
}
