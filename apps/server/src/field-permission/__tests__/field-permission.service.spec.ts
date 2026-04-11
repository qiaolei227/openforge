import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FieldPermissionService } from '../field-permission.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FieldPermissionService', () => {
  let service: FieldPermissionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysField: { findUnique: vi.fn() },
      sysFieldPermission: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        FieldPermissionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(FieldPermissionService);
  });

  it('upsert deletes row when access=editable (restore default)', async () => {
    prisma.sysField.findUnique.mockResolvedValue({ id: 'f1', modelId: 'm1', isSystem: false });
    prisma.sysFieldPermission.deleteMany.mockResolvedValue({ count: 1 });

    await service.upsert({ roleId: 'r1', fieldId: 'f1', access: 'editable' });

    expect(prisma.sysFieldPermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'r1', fieldId: 'f1' },
    });
    expect(prisma.sysFieldPermission.upsert).not.toHaveBeenCalled();
  });

  it('upsert creates row for readonly access', async () => {
    prisma.sysField.findUnique.mockResolvedValue({ id: 'f1', modelId: 'm1', isSystem: false });
    prisma.sysFieldPermission.upsert.mockResolvedValue({});

    await service.upsert({ roleId: 'r1', fieldId: 'f1', access: 'readonly' });

    expect(prisma.sysFieldPermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roleId_fieldId: { roleId: 'r1', fieldId: 'f1' } },
        create: expect.objectContaining({
          roleId: 'r1',
          fieldId: 'f1',
          modelId: 'm1',
          access: 'readonly',
        }),
        update: { access: 'readonly' },
      }),
    );
  });

  it('upsert throws when field is a system field', async () => {
    prisma.sysField.findUnique.mockResolvedValue({ id: 'f1', modelId: 'm1', isSystem: true });
    await expect(
      service.upsert({ roleId: 'r1', fieldId: 'f1', access: 'hidden' }),
    ).rejects.toThrow();
  });

  it('upsert throws when field is not found', async () => {
    prisma.sysField.findUnique.mockResolvedValue(null);
    await expect(
      service.upsert({ roleId: 'r1', fieldId: 'fx', access: 'hidden' }),
    ).rejects.toThrow();
  });

  it('list filters by roleId + modelId', async () => {
    prisma.sysFieldPermission.findMany.mockResolvedValue([]);
    await service.list('r1', 'm1');
    expect(prisma.sysFieldPermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roleId: 'r1', modelId: 'm1' } }),
    );
  });
});
