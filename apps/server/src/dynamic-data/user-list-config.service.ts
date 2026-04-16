import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserListConfigService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async get(userId: string, modelId: string) {
    const row = await this.prisma.sysUserListConfig.findUnique({
      where: { userId_modelId: { userId, modelId } },
    });
    return row?.config ?? {};
  }

  async upsert(userId: string, modelId: string, config: Record<string, any>) {
    await this.prisma.sysUserListConfig.upsert({
      where: { userId_modelId: { userId, modelId } },
      create: { userId, modelId, config },
      update: { config },
    });
    return config;
  }

  async remove(userId: string, modelId: string) {
    await this.prisma.sysUserListConfig.deleteMany({
      where: { userId, modelId },
    });
  }
}
