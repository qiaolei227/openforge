import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../interfaces/request-context';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCodes } from '../exceptions/error-codes';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly redis: Redis;

  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.redis = new Redis(this.configService.get<string>('redis.url') as string);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing access token');

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      // Enforce single session: check sid matches the active session in Redis
      if (payload.sid && payload.platform) {
        const activeSid = await this.redis.get(`sid:${payload.userId}:${payload.platform}`);
        if (activeSid !== payload.sid) {
          throw new BusinessException(401, ErrorCodes.AUTH_SESSION_REPLACED, 'Session replaced by another login');
        }
      }

      request.user = {
        userId: payload.userId,
        orgId: payload.orgId,
        roles: payload.roles,
        isAdmin: !!payload.isAdmin,
        identity: payload.identity ?? 'user',
      } satisfies RequestUser;
    } catch (err) {
      if (err instanceof BusinessException || err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
