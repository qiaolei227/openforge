import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssigneeResolverService, ResolveContext } from '../assignee-resolver.service';
import { ErrorCodes } from '../../common/exceptions/error-codes';

function makeCtx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    record: {},
    submitter: { userId: 'submitter-1', orgId: 'org-1' },
    instance: { id: 'inst-1' },
    ...overrides,
  };
}

describe('AssigneeResolverService', () => {
  let service: AssigneeResolverService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sysUserRole: { findMany: vi.fn() },
      sysUserOrg: { findMany: vi.fn() },
      sysOrganization: { findUnique: vi.fn() },
      sysWorkflowTask: { findMany: vi.fn() },
      $queryRawUnsafe: vi.fn(),
    };
    service = new AssigneeResolverService(prisma as any);
  });

  describe('resolve - fixed', () => {
    it('returns userIds as-is', async () => {
      const result = await service.resolve('fixed', { userIds: ['u1', 'u2'] }, makeCtx());
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('returns empty when userIds is empty', async () => {
      const result = await service.resolve('fixed', { userIds: [] }, makeCtx());
      expect(result).toEqual([]);
    });

    it('deduplicates user ids', async () => {
      const result = await service.resolve('fixed', { userIds: ['u1', 'u1'] }, makeCtx());
      expect(result).toEqual(['u1']);
    });

    it('returns empty when userIds is missing', async () => {
      const result = await service.resolve('fixed', {}, makeCtx());
      expect(result).toEqual([]);
    });
  });

  describe('resolve - role', () => {
    it('queries sysUserRole and returns flatten + dedup', async () => {
      prisma.sysUserRole.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
        { userId: 'u1' }, // dup across roles
      ]);
      const result = await service.resolve('role', { roleIds: ['r1', 'r2'] }, makeCtx());
      expect(prisma.sysUserRole.findMany).toHaveBeenCalledWith({
        where: { roleId: { in: ['r1', 'r2'] } },
        select: { userId: true },
      });
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('returns empty without querying when roleIds empty', async () => {
      const result = await service.resolve('role', { roleIds: [] }, makeCtx());
      expect(prisma.sysUserRole.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty when roleIds missing', async () => {
      const result = await service.resolve('role', {}, makeCtx());
      expect(prisma.sysUserRole.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('resolve - org', () => {
    it('returns members of given orgs without includeChildren', async () => {
      prisma.sysUserOrg.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);
      const result = await service.resolve(
        'org',
        { orgIds: ['o1'], includeChildren: false },
        makeCtx(),
      );
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.sysUserOrg.findMany).toHaveBeenCalledWith({
        where: { orgId: { in: ['o1'] } },
        select: { userId: true },
      });
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('includeChildren=true walks recursive CTE then queries members', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'o1' }, { id: 'o1-child' }]);
      prisma.sysUserOrg.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u3' },
      ]);
      const result = await service.resolve(
        'org',
        { orgIds: ['o1'], includeChildren: true },
        makeCtx(),
      );
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [, params] = prisma.$queryRawUnsafe.mock.calls[0];
      expect(params).toEqual(['o1']);
      expect(prisma.sysUserOrg.findMany).toHaveBeenCalledWith({
        where: { orgId: { in: ['o1', 'o1-child'] } },
        select: { userId: true },
      });
      expect(result.sort()).toEqual(['u1', 'u3']);
    });

    it('returns empty when orgIds empty (no query)', async () => {
      const result = await service.resolve('org', { orgIds: [] }, makeCtx());
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.sysUserOrg.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('resolve - submitterUpline', () => {
    it('upLevel=1 walks parent once and returns members of parent org', async () => {
      prisma.sysOrganization.findUnique.mockResolvedValueOnce({ parentId: 'org-parent' });
      prisma.sysUserOrg.findMany.mockResolvedValue([{ userId: 'mgr-1' }]);

      const result = await service.resolve(
        'submitterUpline',
        { upLevel: 1 },
        makeCtx({ submitter: { userId: 's1', orgId: 'org-child' } }),
      );

      expect(prisma.sysOrganization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-child' },
        select: { parentId: true },
      });
      expect(prisma.sysUserOrg.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-parent' },
        select: { userId: true },
      });
      expect(result).toEqual(['mgr-1']);
    });

    it('upLevel=2 walks parent chain twice', async () => {
      prisma.sysOrganization.findUnique
        .mockResolvedValueOnce({ parentId: 'org-mid' })
        .mockResolvedValueOnce({ parentId: 'org-top' });
      prisma.sysUserOrg.findMany.mockResolvedValue([{ userId: 'boss' }]);

      const result = await service.resolve(
        'submitterUpline',
        { upLevel: 2 },
        makeCtx({ submitter: { userId: 's1', orgId: 'org-child' } }),
      );

      expect(prisma.sysOrganization.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.sysUserOrg.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-top' },
        select: { userId: true },
      });
      expect(result).toEqual(['boss']);
    });

    it('returns [] when chain hits root before upLevel exhausted', async () => {
      prisma.sysOrganization.findUnique
        .mockResolvedValueOnce({ parentId: 'org-mid' })
        .mockResolvedValueOnce({ parentId: null }); // root reached

      const result = await service.resolve(
        'submitterUpline',
        { upLevel: 3 },
        makeCtx({ submitter: { userId: 's1', orgId: 'org-child' } }),
      );

      expect(prisma.sysUserOrg.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('resolve - userField', () => {
    it('single-value field returns [value]', async () => {
      const result = await service.resolve(
        'userField',
        { fieldColumnName: 'assignee' },
        makeCtx({ record: { assignee: 'u1' } }),
      );
      expect(result).toEqual(['u1']);
    });

    it('array-value field (MULTI USER) returns flatten string array', async () => {
      const result = await service.resolve(
        'userField',
        { fieldColumnName: 'assignees' },
        makeCtx({ record: { assignees: ['u1', 'u2'] } }),
      );
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('undefined / null field returns []', async () => {
      const r1 = await service.resolve(
        'userField',
        { fieldColumnName: 'missing' },
        makeCtx({ record: {} }),
      );
      const r2 = await service.resolve(
        'userField',
        { fieldColumnName: 'nullField' },
        makeCtx({ record: { nullField: null } }),
      );
      expect(r1).toEqual([]);
      expect(r2).toEqual([]);
    });

    it('blank fieldColumnName returns []', async () => {
      const result = await service.resolve(
        'userField',
        { fieldColumnName: '' },
        makeCtx({ record: { assignee: 'u1' } }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('resolve - orgField', () => {
    it('orgRole=members queries sysUserOrg', async () => {
      prisma.sysUserOrg.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);
      const result = await service.resolve(
        'orgField',
        { fieldColumnName: 'dept_id', orgRole: 'members' },
        makeCtx({ record: { dept_id: 'o1' } }),
      );
      expect(prisma.sysUserOrg.findMany).toHaveBeenCalledWith({
        where: { orgId: 'o1' },
        select: { userId: true },
      });
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('orgRole=leader falls back to members (no leader column yet)', async () => {
      prisma.sysUserOrg.findMany.mockResolvedValue([{ userId: 'u1' }]);
      const result = await service.resolve(
        'orgField',
        { fieldColumnName: 'dept_id', orgRole: 'leader' },
        makeCtx({ record: { dept_id: 'o1' } }),
      );
      expect(prisma.sysUserOrg.findMany).toHaveBeenCalled();
      expect(result).toEqual(['u1']);
    });

    it('empty value returns []', async () => {
      const result = await service.resolve(
        'orgField',
        { fieldColumnName: 'dept_id' },
        makeCtx({ record: { dept_id: '' } }),
      );
      expect(prisma.sysUserOrg.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('blank fieldColumnName returns []', async () => {
      const result = await service.resolve(
        'orgField',
        { fieldColumnName: '' },
        makeCtx({ record: { dept_id: 'o1' } }),
      );
      expect(prisma.sysUserOrg.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('postProcess', () => {
    it('plain dedup', async () => {
      const result = await service.postProcess(
        ['u1', 'u2', 'u1'],
        { autoSkipDuplicates: false, autoSkipSubmitter: false },
        makeCtx(),
      );
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('autoSkipDuplicates=true removes upstream approved assignees on same instance', async () => {
      prisma.sysWorkflowTask.findMany.mockResolvedValue([
        { assigneeUserId: 'u1' },
        { assigneeUserId: 'u3' },
      ]);
      const result = await service.postProcess(
        ['u1', 'u2', 'u3', 'u4'],
        { autoSkipDuplicates: true, autoSkipSubmitter: false },
        makeCtx({ instance: { id: 'inst-x' } }),
      );
      expect(prisma.sysWorkflowTask.findMany).toHaveBeenCalledWith({
        where: { instanceId: 'inst-x', status: 'approved' },
        select: { assigneeUserId: true },
      });
      expect(result.sort()).toEqual(['u2', 'u4']);
    });

    it('autoSkipDuplicates=false keeps everyone (no upstream query)', async () => {
      const result = await service.postProcess(
        ['u1', 'u2'],
        { autoSkipDuplicates: false, autoSkipSubmitter: false },
        makeCtx(),
      );
      expect(prisma.sysWorkflowTask.findMany).not.toHaveBeenCalled();
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('autoSkipSubmitter=true removes ctx.submitter.userId', async () => {
      const result = await service.postProcess(
        ['u1', 'submitter-1', 'u2'],
        { autoSkipDuplicates: false, autoSkipSubmitter: true },
        makeCtx(),
      );
      expect(result.sort()).toEqual(['u1', 'u2']);
    });

    it('autoSkipSubmitter=false keeps submitter', async () => {
      const result = await service.postProcess(
        ['u1', 'submitter-1'],
        { autoSkipDuplicates: false, autoSkipSubmitter: false },
        makeCtx(),
      );
      expect(result.sort()).toEqual(['submitter-1', 'u1']);
    });

    it('combined: both filters apply', async () => {
      prisma.sysWorkflowTask.findMany.mockResolvedValue([{ assigneeUserId: 'u1' }]);
      const result = await service.postProcess(
        ['u1', 'u2', 'submitter-1', 'u2'],
        { autoSkipDuplicates: true, autoSkipSubmitter: true },
        makeCtx(),
      );
      expect(result).toEqual(['u2']);
    });
  });

  describe('resolveWithFallback', () => {
    it('returns assignees + shouldSkip=false in the normal case', async () => {
      const result = await service.resolveWithFallback({
        strategy: 'fixed',
        config: { userIds: ['u1', 'u2'] },
        ctx: makeCtx(),
        onEmpty: 'error',
        autoSkipDuplicates: false,
        autoSkipSubmitter: false,
      });
      expect(result.shouldSkip).toBe(false);
      expect(result.assignees.sort()).toEqual(['u1', 'u2']);
    });

    it('empty + onEmpty=pass → shouldSkip=true, no error', async () => {
      const result = await service.resolveWithFallback({
        strategy: 'fixed',
        config: { userIds: [] },
        ctx: makeCtx(),
        onEmpty: 'pass',
        autoSkipDuplicates: false,
        autoSkipSubmitter: false,
      });
      expect(result).toEqual({ assignees: [], shouldSkip: true });
    });

    it('empty + onEmpty=fallback (with users) → uses fallback', async () => {
      const result = await service.resolveWithFallback({
        strategy: 'fixed',
        config: { userIds: [] },
        ctx: makeCtx(),
        onEmpty: 'fallback',
        fallbackUserIds: ['u-fallback'],
        autoSkipDuplicates: false,
        autoSkipSubmitter: false,
      });
      expect(result).toEqual({ assignees: ['u-fallback'], shouldSkip: false });
    });

    it('empty + onEmpty=fallback (no users) → shouldSkip=true', async () => {
      const result = await service.resolveWithFallback({
        strategy: 'fixed',
        config: { userIds: [] },
        ctx: makeCtx(),
        onEmpty: 'fallback',
        fallbackUserIds: [],
        autoSkipDuplicates: false,
        autoSkipSubmitter: false,
      });
      expect(result).toEqual({ assignees: [], shouldSkip: true });
    });

    it('empty + onEmpty=error → throws WORKFLOW_ASSIGNEE_RESOLVE_FAILED', async () => {
      await expect(
        service.resolveWithFallback({
          strategy: 'fixed',
          config: { userIds: [] },
          ctx: makeCtx(),
          onEmpty: 'error',
          autoSkipDuplicates: false,
          autoSkipSubmitter: false,
        }),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.WORKFLOW_ASSIGNEE_RESOLVE_FAILED,
      });
    });

    it('non-empty trimmed to empty by autoSkipSubmitter still respects onEmpty=pass', async () => {
      const result = await service.resolveWithFallback({
        strategy: 'fixed',
        config: { userIds: ['submitter-1'] },
        ctx: makeCtx(),
        onEmpty: 'pass',
        autoSkipDuplicates: false,
        autoSkipSubmitter: true,
      });
      expect(result).toEqual({ assignees: [], shouldSkip: true });
    });
  });

  describe('resolve - unknown strategy', () => {
    it('throws WORKFLOW_INVALID_DEFINITION', async () => {
      await expect(
        service.resolve('not-a-strategy' as any, {}, makeCtx()),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION,
      });
    });
  });
});
