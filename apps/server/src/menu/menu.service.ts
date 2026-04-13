import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MENU_ACTIONS, type MenuNode, type MenuAction } from '@openforge/shared';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { nanoid } from 'nanoid';
import type { CreateMenuDto } from './dto/create-menu.dto';
import type { UpdateMenuDto } from './dto/update-menu.dto';
import type { ReorderMenuDto } from './dto/reorder-menu.dto';
import type { RequestUser } from '../common/interfaces/request-context';

@Injectable()
export class MenuService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  // ─── buildTreeForUser ───────────────────────────────────────────────

  /**
   * Build the menu tree as the given user sees it.
   * When appCode is provided, filters menus by that app's ID.
   * When omitted, returns all visible menus (backward compat / workspace home).
   * Admin users get all visible menus with full permissions.
   * Non-admin users get menus filtered by their role-based permissions.
   */
  async buildTreeForUser(user: RequestUser, appCode?: string): Promise<MenuNode[]> {
    // 1. Optionally look up app by code
    let appId: string | undefined;
    let designerOwnsApp = false;
    if (appCode) {
      const app = await this.prisma.sysApp.findUnique({ where: { code: appCode } });
      if (!app) {
        throw new BusinessException(404, ErrorCodes.APP_NOT_FOUND, `App not found: ${appCode}`);
      }
      appId = app.id;

      // Designer who created this app gets full access
      if (!user.isAdmin && user.identity === 'designer' && app.createdBy === user.userId) {
        designerOwnsApp = true;
      }
    }

    // 2. Fetch all visible menus (filtered by appId if provided) + permission map in parallel
    const menuWhere: any = { visible: true };
    if (appId) menuWhere.appId = appId;

    const needsPermissionMap = !user.isAdmin && !designerOwnsApp;

    const [allMenus, permissionMap] = await Promise.all([
      this.prisma.sysMenu.findMany({
        where: menuWhere,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      needsPermissionMap ? this.getPermissionMap(user) : Promise.resolve(new Map<string, MenuAction[]>()),
    ]);

    // 3. Batch-fetch views (with model→app) for menus that have targetViewId
    const viewIds = allMenus
      .map((m: any) => m.targetViewId)
      .filter((id: string | null): id is string => !!id);

    const viewMap = new Map<string, any>();
    if (viewIds.length > 0) {
      const views = await this.prisma.sysView.findMany({
        where: { id: { in: viewIds } },
        include: { model: { include: { app: true } } },
      });
      for (const v of views) viewMap.set(v.id, v);
    }

    // 4. For menus with targetModelId but no targetViewId, batch-fetch models with app
    const modelOnlyIds = allMenus
      .filter((m: any) => m.targetModelId && !m.targetViewId)
      .map((m: any) => m.targetModelId as string);

    const modelMap = new Map<string, any>();
    if (modelOnlyIds.length > 0) {
      const models = await this.prisma.sysModel.findMany({
        where: { id: { in: modelOnlyIds } },
        include: { app: true },
      });
      for (const m of models) modelMap.set(m.id, m);
    }

    // 4b. For the multi-app case (no appCode filter), find designer-owned apps
    let designerOwnedAppIds: Set<string> | null = null;
    if (!appCode && !user.isAdmin && user.identity === 'designer') {
      const ownedApps = await this.prisma.sysApp.findMany({
        where: { createdBy: user.userId },
        select: { id: true },
      });
      designerOwnedAppIds = new Set(ownedApps.map((a) => a.id));
    }

    // 5. Build MenuNode objects
    const adminActions: MenuAction[] = Object.values(MENU_ACTIONS);
    const nodeMap = new Map<string, MenuNode>();

    for (const m of allMenus) {
      // Compute targetAppCode / targetModelCode from fetched view/model data
      let targetAppCode: string | null = null;
      let targetModelCode: string | null = null;

      if (m.targetViewId && viewMap.has(m.targetViewId)) {
        const view = viewMap.get(m.targetViewId)!;
        targetAppCode = view.model?.app?.code ?? null;
        targetModelCode = view.model?.code ?? null;
      } else if (m.targetModelId && modelMap.has(m.targetModelId)) {
        const model = modelMap.get(m.targetModelId)!;
        targetAppCode = model.app?.code ?? null;
        targetModelCode = model.code ?? null;
      }

      nodeMap.set(m.id, {
        id: m.id,
        appId: m.appId,
        code: m.code,
        type: m.type as MenuNode['type'],
        name: m.name,
        icon: m.icon,
        sortOrder: m.sortOrder,
        targetAppCode,
        targetModelCode,
        targetViewType: m.targetViewType ?? null,
        targetViewId: m.targetViewId ?? null,
        targetUrl: m.targetUrl ?? null,
        children: [],
        permissions: (user.isAdmin || designerOwnsApp || designerOwnedAppIds?.has(m.appId))
          ? adminActions
          : (permissionMap.get(m.id) ?? []),
      });
    }

    // 6. Assemble parent-child relationships
    const roots: MenuNode[] = [];
    for (const m of allMenus) {
      const node = nodeMap.get(m.id)!;
      if (m.parentId && nodeMap.has(m.parentId)) {
        nodeMap.get(m.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    if (user.isAdmin || designerOwnsApp) return roots;
    return this.pruneWithoutView(roots);
  }

  // ─── getAdminTree ──────────────────────────────────────────────────

  /**
   * Admin editing view: returns all menus (visible=false included, no role filter).
   * Used by the menu management page.
   * When appCode is provided, filters menus by that app.
   */
  async getAdminTree(appCode?: string): Promise<any[]> {
    const where: Record<string, unknown> = {};
    if (appCode) {
      const app = await this.prisma.sysApp.findUnique({ where: { code: appCode } });
      if (!app) {
        throw new BusinessException(404, ErrorCodes.APP_NOT_FOUND, `App not found: ${appCode}`);
      }
      where.appId = app.id;
    }
    const all = await this.prisma.sysMenu.findMany({
      where,
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

  // ─── create ────────────────────────────────────────────────────────

  async create(dto: CreateMenuDto) {
    await this.validateTarget(dto);

    return this.prisma.sysMenu.create({
      data: {
        code: `menu:${nanoid(8)}`,
        appId: dto.appId,
        parentId: dto.parentId ?? null,
        type: dto.type,
        name: dto.name,
        icon: dto.icon ?? null,
        sortOrder: 0,
        visible: true,
        targetModelId: dto.targetModelId ?? null,
        targetViewType: dto.targetViewType ?? null,
        targetViewId: dto.targetViewId ?? null,
        targetUrl: dto.targetUrl ?? null,
      },
    });
  }

  // ─── update ────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateMenuDto) {
    const menu = await this.prisma.sysMenu.findUnique({ where: { id } });
    if (!menu) {
      throw new BusinessException(404, ErrorCodes.MENU_NOT_FOUND, 'Menu not found');
    }

    // Merge dto with existing, re-validate if target fields change
    const hasTargetChange =
      dto.targetModelId !== undefined ||
      dto.targetViewType !== undefined ||
      dto.targetViewId !== undefined ||
      dto.targetUrl !== undefined ||
      dto.parentId !== undefined;

    if (hasTargetChange) {
      // Build a merged dto for validation
      const merged: CreateMenuDto = {
        appId: menu.appId,
        type: menu.type as CreateMenuDto['type'],
        name: dto.name ?? menu.name,
        parentId: dto.parentId !== undefined ? (dto.parentId ?? undefined) : (menu.parentId ?? undefined),
        targetModelId: dto.targetModelId !== undefined ? (dto.targetModelId ?? undefined) : (menu.targetModelId ?? undefined),
        targetViewType: dto.targetViewType !== undefined ? (dto.targetViewType ?? undefined) : (menu.targetViewType ?? undefined),
        targetViewId: dto.targetViewId !== undefined ? (dto.targetViewId ?? undefined) : (menu.targetViewId ?? undefined),
        targetUrl: dto.targetUrl !== undefined ? (dto.targetUrl ?? undefined) : (menu.targetUrl ?? undefined),
      };
      await this.validateTarget(merged);
    }

    return this.prisma.sysMenu.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.visible !== undefined && { visible: dto.visible }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId ?? null }),
        ...(dto.targetModelId !== undefined && { targetModelId: dto.targetModelId ?? null }),
        ...(dto.targetViewType !== undefined && { targetViewType: dto.targetViewType ?? null }),
        ...(dto.targetViewId !== undefined && { targetViewId: dto.targetViewId ?? null }),
        ...(dto.targetUrl !== undefined && { targetUrl: dto.targetUrl ?? null }),
      },
    });
  }

  // ─── delete ────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const menu = await this.prisma.sysMenu.findUnique({ where: { id } });
    if (!menu) {
      throw new BusinessException(404, ErrorCodes.MENU_NOT_FOUND, 'Menu not found');
    }
    await this.prisma.sysMenu.delete({ where: { id } });
  }

  // ─── reorder ───────────────────────────────────────────────────────

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

  // ─── private: validateTarget ───────────────────────────────────────

  /**
   * Validates all target-related rules for a menu create/update.
   * Rules:
   * 1. appId must exist
   * 2. type=model → targetModelId required, model.appId === dto.appId, targetViewType required,
   *    targetViewId if set must match (modelId, viewType)
   * 3. type=group/divider → all target_* must be empty
   * 4. type=link → targetUrl required, others empty
   * 5. parentId if set → parent.appId === dto.appId
   */
  private async validateTarget(dto: CreateMenuDto): Promise<void> {
    // Rule 1: appId must exist
    const app = await this.prisma.sysApp.findUnique({ where: { id: dto.appId } });
    if (!app) {
      throw new BusinessException(404, ErrorCodes.APP_NOT_FOUND, `App not found: ${dto.appId}`);
    }

    const { type } = dto;

    // Rule 3: group/divider → no target fields
    if (type === 'group' || type === 'divider') {
      if (dto.targetModelId || dto.targetViewType || dto.targetViewId || dto.targetUrl) {
        throw new BusinessException(
          400, ErrorCodes.MENU_TARGET_MISMATCH,
          `type=${type} must not have target_* fields`,
        );
      }
    }

    // Rule 4: link → targetUrl required, no model fields
    if (type === 'link') {
      if (!dto.targetUrl) {
        throw new BusinessException(
          400, ErrorCodes.MENU_TARGET_MISMATCH,
          'type=link requires targetUrl',
        );
      }
      if (dto.targetModelId || dto.targetViewType || dto.targetViewId) {
        throw new BusinessException(
          400, ErrorCodes.MENU_TARGET_MISMATCH,
          'type=link must not have model target fields',
        );
      }
    }

    // Rule 2: model → targetModelId + targetViewType required, cross-app check, view consistency
    if (type === 'model') {
      if (!dto.targetModelId || !dto.targetViewType) {
        throw new BusinessException(
          400, ErrorCodes.MENU_TARGET_MISMATCH,
          'type=model requires targetModelId + targetViewType',
        );
      }

      const model = await this.prisma.sysModel.findUnique({
        where: { id: dto.targetModelId },
      });
      if (!model) {
        throw new BusinessException(
          404, ErrorCodes.MODEL_NOT_FOUND,
          `Target model not found: ${dto.targetModelId}`,
        );
      }

      // Cross-app isolation
      if (model.appId !== dto.appId) {
        throw new BusinessException(
          400, ErrorCodes.MENU_CROSS_APP,
          'targetModelId belongs to a different app',
        );
      }

      // View consistency check
      if (dto.targetViewId) {
        const view = await this.prisma.sysView.findUnique({
          where: { id: dto.targetViewId },
        });
        if (!view) {
          throw new BusinessException(
            404, ErrorCodes.VIEW_NOT_FOUND,
            `Target view not found: ${dto.targetViewId}`,
          );
        }
        if (view.modelId !== dto.targetModelId || view.type !== dto.targetViewType) {
          throw new BusinessException(
            400, ErrorCodes.MENU_TARGET_INCONSISTENT,
            'targetViewId does not match (targetModelId, targetViewType)',
          );
        }
      }
    }

    // Rule 5: parentId → same app
    if (dto.parentId) {
      const parent = await this.prisma.sysMenu.findUnique({
        where: { id: dto.parentId },
      });
      if (parent && parent.appId !== dto.appId) {
        throw new BusinessException(
          400, ErrorCodes.MENU_CROSS_APP,
          'parentId belongs to a different app',
        );
      }
    }
  }

  // ─── private: getPermissionMap ─────────────────────────────────────

  /**
   * Builds a Map<menuId, MenuAction[]> from sys_role_menu for the given user.
   * Uses menuId (not menuCode) as the map key.
   */
  private async getPermissionMap(user: RequestUser): Promise<Map<string, MenuAction[]>> {
    if (user.isAdmin) return new Map();

    const rows = await this.prisma.sysRoleMenu.findMany({
      where: {
        role: { userRoles: { some: { userId: user.userId } } },
      },
      select: { menuId: true, permissions: true },
    });

    const setMap = new Map<string, Set<MenuAction>>();
    for (const row of rows) {
      const set = setMap.get(row.menuId) ?? new Set<MenuAction>();
      for (const p of row.permissions as MenuAction[]) set.add(p);
      setMap.set(row.menuId, set);
    }

    const result = new Map<string, MenuAction[]>();
    for (const [k, v] of setMap.entries()) result.set(k, Array.from(v));
    return result;
  }

  // ─── private: pruneWithoutView ─────────────────────────────────────

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
      if (node.permissions.includes(MENU_ACTIONS.VIEW)) result.push(node);
    }
    return result;
  }
}
