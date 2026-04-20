import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { OrgService } from '../org.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../event-bus/event-bus.service';

describe('OrgService.getAccessibleOrgs', () => {
  let prisma: any;
  let service: OrgService;

  beforeEach(async () => {
    prisma = {
      sysOrganization: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
      sysUserOrg: { findMany: vi.fn(), count: vi.fn() },
    };
    const eventBus = { emit: vi.fn() };
    const module = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: eventBus },
      ],
    }).compile();
    service = module.get(OrgService);
  });

  it('admin returns all orgs', async () => {
    prisma.sysOrganization.findMany.mockResolvedValue([
      { id: 'o1', name: 'HQ', parentId: null, code: 'hq' },
      { id: 'o2', name: 'SH', parentId: 'o1', code: 'sh' },
    ]);
    const res = await service.getAccessibleOrgs('u1', true);
    expect(res).toHaveLength(2);
    expect(prisma.sysUserOrg.findMany).not.toHaveBeenCalled();
  });

  it('regular user returns only sys_user_org-linked orgs', async () => {
    prisma.sysUserOrg.findMany.mockResolvedValue([{ orgId: 'o2' }]);
    prisma.sysOrganization.findMany.mockResolvedValue([
      { id: 'o2', name: 'SH', parentId: 'o1', code: 'sh' },
    ]);
    const res = await service.getAccessibleOrgs('u1', false);
    expect(prisma.sysOrganization.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['o2'] } },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
    expect(res).toHaveLength(1);
  });

  it('user with no org links returns empty array', async () => {
    prisma.sysUserOrg.findMany.mockResolvedValue([]);
    const res = await service.getAccessibleOrgs('u1', false);
    expect(res).toEqual([]);
    expect(prisma.sysOrganization.findMany).not.toHaveBeenCalled();
  });
});
