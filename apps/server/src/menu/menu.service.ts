import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MENU_ACTIONS, type MenuNode, type MenuAction } from '@openforge/shared';

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
}
