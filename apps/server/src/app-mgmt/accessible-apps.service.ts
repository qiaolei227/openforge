import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/interfaces/request-context';

@Injectable()
export class AccessibleAppsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async listForUser(user: Pick<RequestUser, 'userId' | 'isAdmin'>) {
    const apps = user.isAdmin
      ? await this.prisma.sysApp.findMany({
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        })
      : await this.prisma.sysApp.findMany({
          where: {
            menus: {
              some: {
                roleMenus: {
                  some: {
                    permissions: { has: 'view' },
                    role: { userRoles: { some: { userId: user.userId } } },
                  },
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

    return apps.map((a: any) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      icon: a.icon,
      themeColor: a.themeColor,
      description: a.description,
      sortOrder: a.sortOrder,
    }));
  }
}
