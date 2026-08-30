import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import {
  isPostgresError,
  POSTGRES_ERROR_CODE,
} from '../common/database/postgres-error';
import { AppException } from '../common/errors/app.exception';
import { User } from './user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new AppException('AUTH_EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = this.userRepository.create({
      email,
      passwordHash,
    });

    let savedUser: User;

    try {
      savedUser = await this.userRepository.save(user);
    } catch (error) {
      if (this.isEmailUniqueViolation(error)) {
        throw new AppException('AUTH_EMAIL_ALREADY_EXISTS');
      }

      throw error;
    }

    return this.createTokenResponse(savedUser);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new AppException('AUTH_INVALID_CREDENTIALS');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new AppException('AUTH_INVALID_CREDENTIALS');
    }

    return this.createTokenResponse(user);
  }

  private async createTokenResponse(user: User) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  private isEmailUniqueViolation(error: unknown): boolean {
    return isPostgresError(error, {
      code: POSTGRES_ERROR_CODE.UNIQUE_VIOLATION,
      constraint: 'UQ_97672ac88f789774dd47f7c8be3',
    });
  }
}
