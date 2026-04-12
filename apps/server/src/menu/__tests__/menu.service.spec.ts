import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { MenuService } from '../menu.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

/** Helper: extract errorCode from BusinessException */
function getErrorCode(e: unknown): string | undefined {
  if (e instanceof BusinessException) {
    const resp = e.getResponse() as any;
    return resp.errorCode;
  }
  return undefined;
}

describe('MenuService', () => {
  let service: MenuService;
  let prisma: any;

  // Reusable test data
  const APP_ID = 'app-uuid-1';
  const APP_CODE = 'crm';
  const MODEL_ID = 'model-uuid-1';
  const MODEL_CODE = 'customer';
  const VIEW_ID = 'view-uuid-1';
  const VIEW_TYPE = 'list';
  const OTHER_APP_ID = 'app-uuid-other';

  beforeEach(async () => {
    prisma = {
      sysApp: {
        findUnique: vi.fn(),
      },
      sysMenu: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      sysModel: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      sysView: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      sysRoleMenu: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((ops: any) => Promise.all(ops)),
    };
    const module = await Test.createTestingModule({
      providers: [
        MenuService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MenuService);
  });

  // ─── buildTreeForUser ───

  describe('buildTreeForUser', () => {
    it('filters menus by appCode → appId', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysMenu.findMany.mockResolvedValue([
        {
          id: 'g1', appId: APP_ID, parentId: null, code: 'menu:g1',
          type: 'group', name: '客户管理', icon: null, sortOrder: 100, visible: true,
          targetModelId: null, targetViewType: null, targetViewId: null, targetUrl: null,
        },
      ]);
      prisma.sysView.findMany.mockResolvedValue([]);
      prisma.sysModel.findMany.mockResolvedValue([]);
      prisma.sysRoleMenu.findMany.mockResolvedValue([]);

      const tree = await service.buildTreeForUser(
        { userId: 'u1', orgId: 'org1', roles: [], isAdmin: true },
        APP_CODE,
      );

      expect(prisma.sysApp.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: APP_CODE } }),
      );
      expect(prisma.sysMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ appId: APP_ID, visible: true }),
        }),
      );
      expect(tree).toHaveLength(1);
      expect(tree[0].appId).toBe(APP_ID);
    });

    it('throws APP_NOT_FOUND when appCode does not exist', async () => {
      prisma.sysApp.findUnique.mockResolvedValue(null);

      const err = await service.buildTreeForUser(
        { userId: 'u1', orgId: 'org1', roles: [], isAdmin: true },
        'nonexistent',
      ).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.APP_NOT_FOUND);
    });

    it('resolves targetAppCode/targetModelCode from view→model→app when targetViewId is set', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysMenu.findMany.mockResolvedValue([
        {
          id: 'm1', appId: APP_ID, parentId: null, code: 'menu:m1',
          type: 'model', name: '客户列表', icon: null, sortOrder: 10, visible: true,
          targetModelId: MODEL_ID, targetViewType: VIEW_TYPE, targetViewId: VIEW_ID,
          targetUrl: null,
        },
      ]);
      prisma.sysView.findMany.mockResolvedValue([
        {
          id: VIEW_ID,
          type: VIEW_TYPE,
          modelId: MODEL_ID,
          model: { id: MODEL_ID, code: MODEL_CODE, appId: APP_ID, app: { id: APP_ID, code: APP_CODE } },
        },
      ]);
      prisma.sysModel.findMany.mockResolvedValue([]);

      const tree = await service.buildTreeForUser(
        { userId: 'u1', orgId: 'org1', roles: [], isAdmin: true },
        APP_CODE,
      );

      expect(tree[0].targetAppCode).toBe(APP_CODE);
      expect(tree[0].targetModelCode).toBe(MODEL_CODE);
      expect(tree[0].targetViewType).toBe(VIEW_TYPE);
      expect(tree[0].targetViewId).toBe(VIEW_ID);
    });

    it('resolves targetAppCode/targetModelCode from targetModelId when targetViewId is null', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysMenu.findMany.mockResolvedValue([
        {
          id: 'm1', appId: APP_ID, parentId: null, code: 'menu:m1',
          type: 'model', name: '客户列表', icon: null, sortOrder: 10, visible: true,
          targetModelId: MODEL_ID, targetViewType: VIEW_TYPE, targetViewId: null,
          targetUrl: null,
        },
      ]);
      prisma.sysView.findMany.mockResolvedValue([]);
      prisma.sysModel.findMany.mockResolvedValue([
        {
          id: MODEL_ID, code: MODEL_CODE, appId: APP_ID,
          app: { id: APP_ID, code: APP_CODE },
        },
      ]);

      const tree = await service.buildTreeForUser(
        { userId: 'u1', orgId: 'org1', roles: [], isAdmin: true },
        APP_CODE,
      );

      expect(tree[0].targetAppCode).toBe(APP_CODE);
      expect(tree[0].targetModelCode).toBe(MODEL_CODE);
      expect(tree[0].targetViewId).toBeNull();
    });

    it('permission map uses menuId as key for non-admin users', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysMenu.findMany.mockResolvedValue([
        {
          id: 'm1', appId: APP_ID, parentId: null, code: 'menu:m1',
          type: 'model', name: '客户', icon: null, sortOrder: 10, visible: true,
          targetModelId: MODEL_ID, targetViewType: VIEW_TYPE, targetViewId: null,
          targetUrl: null,
        },
      ]);
      prisma.sysView.findMany.mockResolvedValue([]);
      prisma.sysModel.findMany.mockResolvedValue([
        {
          id: MODEL_ID, code: MODEL_CODE, appId: APP_ID,
          app: { id: APP_ID, code: APP_CODE },
        },
      ]);
      prisma.sysRoleMenu.findMany.mockResolvedValue([
        { menuId: 'm1', permissions: ['view', 'create'] },
      ]);

      const tree = await service.buildTreeForUser(
        { userId: 'u1', orgId: 'org1', roles: ['role1'], isAdmin: false },
        APP_CODE,
      );

      expect(tree[0].permissions).toContain('view');
      expect(tree[0].permissions).toContain('create');
    });
  });

  // ─── create ───

  describe('create', () => {
    it('rejects targetModelId from different app (MENU_CROSS_APP)', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysModel.findUnique.mockResolvedValue({
        id: MODEL_ID, appId: OTHER_APP_ID, code: MODEL_CODE,
      });

      const err = await service.create({
        appId: APP_ID,
        type: 'model',
        name: '客户',
        targetModelId: MODEL_ID,
        targetViewType: 'list',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_CROSS_APP);
    });

    it('accepts same-app targetModelId and creates the menu', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysModel.findUnique.mockResolvedValue({
        id: MODEL_ID, appId: APP_ID, code: MODEL_CODE,
      });
      prisma.sysMenu.create.mockResolvedValue({ id: 'new-menu-id' });

      const result = await service.create({
        appId: APP_ID,
        type: 'model',
        name: '客户',
        targetModelId: MODEL_ID,
        targetViewType: 'list',
      });

      expect(prisma.sysMenu.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 'new-menu-id' });
    });

    it('rejects targetViewId that belongs to a different model (MENU_TARGET_INCONSISTENT)', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysModel.findUnique.mockResolvedValue({
        id: MODEL_ID, appId: APP_ID, code: MODEL_CODE,
      });
      prisma.sysView.findUnique.mockResolvedValue({
        id: VIEW_ID, modelId: 'other-model-id', type: 'list',
      });

      const err = await service.create({
        appId: APP_ID,
        type: 'model',
        name: '客户',
        targetModelId: MODEL_ID,
        targetViewType: 'list',
        targetViewId: VIEW_ID,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_TARGET_INCONSISTENT);
    });

    it('rejects targetViewId with mismatched viewType (MENU_TARGET_INCONSISTENT)', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysModel.findUnique.mockResolvedValue({
        id: MODEL_ID, appId: APP_ID, code: MODEL_CODE,
      });
      prisma.sysView.findUnique.mockResolvedValue({
        id: VIEW_ID, modelId: MODEL_ID, type: 'form', // mismatch: dto says 'list'
      });

      const err = await service.create({
        appId: APP_ID,
        type: 'model',
        name: '客户',
        targetModelId: MODEL_ID,
        targetViewType: 'list',
        targetViewId: VIEW_ID,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_TARGET_INCONSISTENT);
    });

    it('rejects type=group with target_* fields set (MENU_TARGET_MISMATCH)', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });

      const err = await service.create({
        appId: APP_ID,
        type: 'group',
        name: '分组',
        targetModelId: MODEL_ID,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_TARGET_MISMATCH);
    });

    it('rejects parent from different app (MENU_CROSS_APP)', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });
      prisma.sysMenu.findUnique.mockResolvedValue({
        id: 'parent-id', appId: OTHER_APP_ID,
      });

      const err = await service.create({
        appId: APP_ID,
        type: 'group',
        name: '分组',
        parentId: 'parent-id',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_CROSS_APP);
    });

    it('rejects type=link without targetUrl (MENU_TARGET_MISMATCH)', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });

      const err = await service.create({
        appId: APP_ID,
        type: 'link',
        name: '外部链接',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_TARGET_MISMATCH);
    });

    it('rejects type=model without targetModelId (MENU_TARGET_MISMATCH)', async () => {
      prisma.sysApp.findUnique.mockResolvedValue({ id: APP_ID, code: APP_CODE });

      const err = await service.create({
        appId: APP_ID,
        type: 'model',
        name: '客户',
        targetViewType: 'list',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_TARGET_MISMATCH);
    });
  });

  // ─── update ───

  describe('update', () => {
    it('restricts coded menus to name/icon/sortOrder/visible changes', async () => {
      prisma.sysMenu.findUnique.mockResolvedValue({
        id: 'coded-id', source: 'coded', name: '用户', icon: null,
        sortOrder: 10, visible: true, appId: APP_ID,
      });
      prisma.sysMenu.update.mockResolvedValue({ id: 'coded-id', name: '新名称' });

      await service.update('coded-id', { name: '新名称' });

      expect(prisma.sysMenu.update).toHaveBeenCalledWith({
        where: { id: 'coded-id' },
        data: expect.objectContaining({ name: '新名称' }),
      });
    });

    it('throws MENU_NOT_FOUND for unknown id', async () => {
      prisma.sysMenu.findUnique.mockResolvedValue(null);

      const err = await service.update('unknown-id', { name: 'x' }).catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_NOT_FOUND);
    });
  });

  // ─── delete ───

  describe('delete', () => {
    it('rejects deletion of coded menus', async () => {
      prisma.sysMenu.findUnique.mockResolvedValue({
        id: 'coded-id', source: 'coded',
      });

      const err = await service.delete('coded-id').catch((e) => e);

      expect(err).toBeInstanceOf(BusinessException);
      expect(getErrorCode(err)).toBe(ErrorCodes.MENU_NOT_DELETABLE);
    });

    it('deletes designer menus', async () => {
      prisma.sysMenu.findUnique.mockResolvedValue({
        id: 'designer-id', source: 'designer',
      });
      prisma.sysMenu.delete.mockResolvedValue({});

      await service.delete('designer-id');

      expect(prisma.sysMenu.delete).toHaveBeenCalledWith({ where: { id: 'designer-id' } });
    });
  });
});
