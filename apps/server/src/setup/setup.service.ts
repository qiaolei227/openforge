import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { InitSystemDto } from './dto/init-system.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async getStatus() {
    const userCount = await this.prisma.sysUser.count();
    return { initialized: userCount > 0 };
  }

  async initSystem(dto: InitSystemDto) {
    // Pre-check (non-authoritative — real guard is DB unique constraint)
    const { initialized } = await this.getStatus();
    if (initialized) {
      throw new BusinessException(403, ErrorCodes.SETUP_ALREADY_INITIALIZED, 'System is already initialized');
    }

    // Hash password outside transaction (CPU-intensive, ~100ms)
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    let result: { org: any; admin: any };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const org = await tx.sysOrganization.create({
          data: { name: dto.orgName, code: dto.orgCode, status: 'active' },
        });

        const admin = await tx.sysUser.create({
        data: {
          username: dto.adminUsername,
          passwordHash,
          displayName: dto.adminDisplayName,
          isAdmin: true,
          status: 'active',
          userOrgs: { create: { orgId: org.id, isDefault: true } },
        },
      });

      // Save system configs
      const configUpdates = [
        dto.locale ? { code: 'system.locale', value: dto.locale } : null,
        dto.systemName ? { code: 'system.name', value: dto.systemName } : null,
        dto.logo ? { code: 'system.logo', value: dto.logo } : null,
      ].filter(Boolean) as Array<{ code: string; value: string }>;

      for (const cfg of configUpdates) {
        await tx.sysConfig.upsert({
          where: { code: cfg.code },
          update: { value: cfg.value },
          create: { code: cfg.code, name: cfg.code, defaultVal: '', value: cfg.value, description: '' },
        });
      }

      return { org, admin };
    });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BusinessException(403, ErrorCodes.SETUP_ALREADY_INITIALIZED, 'System is already initialized');
      }
      throw err;
    }

    // Auto-login
    const tokens = await this.authService.login(dto.adminUsername, dto.adminPassword, 'web');

    return {
      ...tokens,
      user: { id: result.admin.id, username: result.admin.username, displayName: result.admin.displayName },
      org: { id: result.org.id, name: result.org.name, code: result.org.code },
    };
  }
}
