import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MENU_ACTIONS, type MenuNode, type MenuAction } from '@openforge/shared';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { nanoid } from 'nanoid';
import type { CreateMenuDto } from './dto/create-menu.dto';
import type { UpdateMenuDto } from './dto/update-menu.dto';
import type { ReorderMenuDto } from './dto/reorder-menu.dto';

interface UserCtx {
  id: string;
  isAdmin: boolean;
}

@Injectable()
export class MenuService {
  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /**
   * Build the menu tree as the given user sees it, with role-based filtering.
   * is_admin users get all visible menus with full permissions.
   */
  async buildTreeForUser(user: UserCtx): Promise<MenuNode[]> {
    const allMenus = await this.prisma.sysMenu.findMany({
      where: { visible: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const permissionMap = await this.getPermissionMap(user);
    const adminActions: MenuAction[] = Object.values(MENU_ACTIONS);

    // Build MenuNode objects with filled permissions
    const nodeMap = new Map<string, MenuNode>();
    for (const m of allMenus) {
      nodeMap.set(m.id, {
        id: m.id,
        code: m.code,
        type: m.type as MenuNode['type'],
        name: m.name,
        nameEn: m.nameEn,
        icon: m.icon,
        sortOrder: m.sortOrder,
        targetRoute: m.targetRoute,
        targetAppCode: m.targetAppCode,
        targetModelCode: m.targetModelCode,
        targetViewId: m.targetViewId,
        targetFilterPreset: m.targetFilterPreset as Record<string, unknown> | null,
        targetUrl: m.targetUrl,
        children: [],
        permissions: user.isAdmin
          ? adminActions
          : (permissionMap.get(m.code) ?? []),
      });
    }

    // Assemble parent-child relationships
    const roots: MenuNode[] = [];
    for (const m of allMenus) {
      const node = nodeMap.get(m.id)!;
      if (m.parentId && nodeMap.has(m.parentId)) {
        nodeMap.get(m.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    if (user.isAdmin) return roots;
    return this.pruneWithoutView(roots);
  }

  /**
   * Admin editing view: returns all menus (visible=false included, no role filter).
   * Used by the menu management page.
   */
  async getAdminTree(): Promise<any[]> {
    const all = await this.prisma.sysMenu.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const nodeMap = new Map<string, any>();
    for (const m of all) nodeMap.set(m.id, { ...m, children: [] });
    const roots: any[] = [];
    for (const m of all) {
      const n = nodeMap.get(m.id);
      if (m.parentId && nodeMap.has(m.parentId)) {
        nodeMap.get(m.parentId).children.push(n);
      } else {
        roots.push(n);
      }
    }
    return roots;
  }

  private async getPermissionMap(user: UserCtx): Promise<Map<string, MenuAction[]>> {
    if (user.isAdmin) return new Map();
    const rows = await this.prisma.sysRoleMenu.findMany({
      where: {
        role: { userRoles: { some: { userId: user.id } } },
      },
      select: { menuCode: true, permissions: true },
    });
    const setMap = new Map<string, Set<MenuAction>>();
    for (const row of rows) {
      const set = setMap.get(row.menuCode) ?? new Set<MenuAction>();
      for (const p of row.permissions as MenuAction[]) set.add(p);
      setMap.set(row.menuCode, set);
    }
    const result = new Map<string, MenuAction[]>();
    for (const [k, v] of setMap.entries()) result.set(k, Array.from(v));
    return result;
  }

  /**
   * Recursive prune: drop pages/links/models without view permission;
   * keep group/divider nodes only if they still have visible children.
   */
  private pruneWithoutView(nodes: MenuNode[]): MenuNode[] {
    const result: MenuNode[] = [];
    for (const node of nodes) {
      node.children = this.pruneWithoutView(node.children);
      if (node.type === 'group' || node.type === 'divider') {
        if (node.children.length > 0) result.push(node);
        continue;
      }
      if (node.permissions.includes('view' as MenuAction)) result.push(node);
    }
    return result;
  }

  async create(dto: CreateMenuDto) {
    this.validateCreateTarget(dto);
    return this.prisma.sysMenu.create({
      data: {
        code: `menu:${nanoid(8)}`,
        source: 'designer',
        parentId: dto.parentId ?? null,
        type: dto.type,
        name: dto.name,
        nameEn: dto.nameEn ?? null,
        icon: dto.icon ?? null,
        sortOrder: 0,
        visible: true,
        targetAppCode: dto.targetAppCode ?? null,
        targetModelCode: dto.targetModelCode ?? null,
        targetViewId: dto.targetViewId ?? null,
        targetFilterPreset: (dto.targetFilterPreset ?? null) as any,
        targetUrl: dto.targetUrl ?? null,
      },
    });
  }

  private validateCreateTarget(dto: CreateMenuDto): void {
    const { type } = dto;
    if (type === 'model' && (!dto.targetAppCode || !dto.targetModelCode)) {
      throw new BusinessException(
        400, ErrorCodes.MENU_TARGET_MISMATCH,
        'type=model requires targetAppCode + targetModelCode',
      );
    }
    if (type === 'link' && !dto.targetUrl) {
      throw new BusinessException(
        400, ErrorCodes.MENU_TARGET_MISMATCH,
        'type=link requires targetUrl',
      );
    }
    if ((type === 'group' || type === 'divider') &&
        (dto.targetAppCode || dto.targetModelCode || dto.targetUrl)) {
      throw new BusinessException(
        400, ErrorCodes.MENU_TARGET_MISMATCH,
        `type=${type} must not have target_* fields`,
      );
    }
  }

  async update(id: string, dto: UpdateMenuDto) {
    const menu = await this.prisma.sysMenu.findUnique({ where: { id } });
    if (!menu) {
      throw new BusinessException(404, ErrorCodes.MENU_NOT_FOUND, 'Menu not found');
    }

    if (menu.source === 'coded') {
      // coded menus only allow changing name/nameEn/icon/sortOrder/visible
      return this.prisma.sysMenu.update({
        where: { id },
        data: {
          name: dto.name ?? menu.name,
          nameEn: dto.nameEn ?? menu.nameEn,
          icon: dto.icon ?? menu.icon,
          sortOrder: dto.sortOrder ?? menu.sortOrder,
          visible: dto.visible ?? menu.visible,
        },
      });
    }
    return this.prisma.sysMenu.update({ where: { id }, data: dto as any });
  }

  async delete(id: string): Promise<void> {
    const menu = await this.prisma.sysMenu.findUnique({ where: { id } });
    if (!menu) {
      throw new BusinessException(404, ErrorCodes.MENU_NOT_FOUND, 'Menu not found');
    }
    if (menu.source === 'coded') {
      throw new BusinessException(
        400, ErrorCodes.MENU_NOT_DELETABLE,
        'coded menus cannot be deleted',
      );
    }
    await this.prisma.sysMenu.delete({ where: { id } });
  }

  async reorder(dto: ReorderMenuDto) {
    return this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.sysMenu.update({
          where: { id: item.id },
          data: {
            parentId: item.parentId ?? null,
            sortOrder: item.sortOrder,
          },
        }),
      ),
    );
  }
}
