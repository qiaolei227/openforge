import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/profile.dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.redis = new Redis(this.configService.get<string>('redis.url') as string);
  }

  async login(username: string, password: string, platform: 'web' | 'mobile') {
    const user = await this.prisma.sysUser.findUnique({
      where: { username },
      include: {
        userOrgs: {
          where: { isDefault: true },
          include: { org: true },
        },
      },
    });

    if (!user || user.status !== 'active') {
      throw new BusinessException(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new BusinessException(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid credentials');
    }

    const defaultOrg = user.userOrgs[0];
    if (!defaultOrg) {
      throw new BusinessException(401, ErrorCodes.AUTH_NO_ORGANIZATION, 'User has no organization');
    }

    const payload = {
      userId: user.id,
      orgId: defaultOrg.orgId,
      roles: [] as string[],
    };

    const tokens = await this.generateTokens(payload);

    // Store session by platform (kick previous session on same platform)
    const sessionKey = `session:${user.id}:${platform}`;
    const oldSession = await this.redis.get(sessionKey);
    if (oldSession) {
      const old = JSON.parse(oldSession);
      await this.redis.del(`refresh:${old.refreshToken}`);
    }

    await this.redis.set(
      sessionKey,
      JSON.stringify({ refreshToken: tokens.refreshToken }),
      'EX',
      7 * 24 * 3600,
    );
    await this.redis.set(
      `refresh:${tokens.refreshToken}`,
      JSON.stringify({ userId: user.id, orgId: defaultOrg.orgId, platform }),
      'EX',
      7 * 24 * 3600,
    );

    return { ...tokens, isAdmin: user.isAdmin };
  }

  async refresh(refreshToken: string) {
    const sessionData = await this.redis.get(`refresh:${refreshToken}`);
    if (!sessionData) {
      throw new BusinessException(401, ErrorCodes.AUTH_INVALID_REFRESH_TOKEN, 'Invalid refresh token');
    }

    const { userId, orgId, platform } = JSON.parse(sessionData);

    await this.redis.del(`refresh:${refreshToken}`);

    const payload = { userId, orgId, roles: [] as string[] };
    const tokens = await this.generateTokens(payload);

    const sessionKey = `session:${userId}:${platform}`;
    await this.redis.set(
      sessionKey,
      JSON.stringify({ refreshToken: tokens.refreshToken }),
      'EX',
      7 * 24 * 3600,
    );
    await this.redis.set(
      `refresh:${tokens.refreshToken}`,
      JSON.stringify({ userId, orgId, platform }),
      'EX',
      7 * 24 * 3600,
    );

    return tokens;
  }

  async logout(userId: string, platform: 'web' | 'mobile') {
    const sessionKey = `session:${userId}:${platform}`;
    const sessionData = await this.redis.get(sessionKey);
    if (sessionData) {
      const { refreshToken } = JSON.parse(sessionData);
      await this.redis.del(`refresh:${refreshToken}`);
      await this.redis.del(sessionKey);
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.sysUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        avatar: true,
      },
    });
    if (!user) {
      throw new BusinessException(401, ErrorCodes.AUTH_USER_NOT_FOUND, 'User not found');
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.sysUser.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        avatar: true,
      },
    });
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.sysUser.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new BusinessException(401, ErrorCodes.AUTH_USER_NOT_FOUND, 'User not found');
    }

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new BusinessException(400, ErrorCodes.AUTH_WRONG_PASSWORD, 'Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.sysUser.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Create a one-time handoff code storing tokens in Redis (60s TTL).
   * Used for cross-origin auth handoff between portal and designer/runtime.
   */
  async createHandoffCode(accessToken: string, refreshToken: string): Promise<string> {
    const code = require('crypto').randomUUID();
    await this.redis.set(
      `handoff:${code}`,
      JSON.stringify({ accessToken, refreshToken }),
      'EX',
      60,
    );
    return code;
  }

  /**
   * Exchange a one-time handoff code for tokens. Code is deleted after use.
   */
  async exchangeHandoffCode(code: string) {
    const key = `handoff:${code}`;
    const data = await this.redis.get(key);
    if (!data) {
      throw new BusinessException(401, ErrorCodes.AUTH_INVALID_HANDOFF_CODE, 'Invalid or expired handoff code');
    }
    await this.redis.del(key);
    return JSON.parse(data);
  }

  private async generateTokens(payload: { userId: string; orgId: string; roles: string[] }) {
    const accessOptions: JwtSignOptions = {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiration') as JwtSignOptions['expiresIn'],
    };
    const refreshOptions: JwtSignOptions = {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiration') as JwtSignOptions['expiresIn'],
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, accessOptions),
      this.jwtService.signAsync(payload, refreshOptions),
    ]);
    return { accessToken, refreshToken };
  }
}
