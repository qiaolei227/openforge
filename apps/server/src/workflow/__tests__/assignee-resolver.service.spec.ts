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
