import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import type { GrantPermissionDto } from './dto/grant-permission.dto';
import type { RevokePermissionDto } from './dto/revoke-permission.dto';

@Injectable()
export class RolePermissionService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async listByRole(roleId: string) {
    await this.assertRoleExists(roleId);
    return this.prisma.sysRolePermission.findMany({
      where: { roleId },
      orderBy: { resource: 'asc' },
    });
  }

  async grant(roleId: string, dto: GrantPermissionDto) {
    await this.assertRoleExists(roleId);
    return this.prisma.sysRolePermission.upsert({
      where: { roleId_resource: { roleId, resource: dto.resource } },
      create: { roleId, resource: dto.resource, actions: dto.actions },
      update: { actions: dto.actions },
    });
  }

  async revoke(roleId: string, dto: RevokePermissionDto) {
    await this.assertRoleExists(roleId);
    await this.prisma.sysRolePermission.delete({
      where: { roleId_resource: { roleId, resource: dto.resource } },
    });
  }

  async check(roleIds: string[], resource: string, action: string): Promise<boolean> {
    if (roleIds.length === 0) return false;
    const grant = await this.prisma.sysRolePermission.findFirst({
      where: {
        roleId: { in: roleIds },
        resource,
        actions: { has: action },
      },
    });
    return grant !== null;
  }

  private async assertRoleExists(roleId: string) {
    const role = await this.prisma.sysRole.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new BusinessException(404, ErrorCodes.ROLE_NOT_FOUND, 'Role not found');
    }
  }
}
