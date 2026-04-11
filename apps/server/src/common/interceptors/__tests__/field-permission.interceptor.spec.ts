import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { FieldPermissionInterceptor } from '../field-permission.interceptor';
import { PermissionService } from '../../permission/permission.service';
import { PrismaService } from '../../../prisma/prisma.service';

function mockContext(params: {
  method?: string;
  url: string;
  user?: any;
  body?: any;
}): ExecutionContext {
  const req = {
    method: params.method ?? 'GET',
    url: params.url,
    user: params.user,
    body: params.body,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('FieldPermissionInterceptor', () => {
  let interceptor: FieldPermissionInterceptor;
  let permService: { getFieldPermissions: ReturnType<typeof vi.fn> };
  let prisma: { sysModel: { findFirst: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    permService = { getFieldPermissions: vi.fn() };
    prisma = { sysModel: { findFirst: vi.fn() } };
    interceptor = new FieldPermissionInterceptor(
      permService as unknown as PermissionService,
      prisma as unknown as PrismaService,
    );
  });

  it('skips non-business-data paths', async () => {
    const ctx = mockContext({ url: '/api/apps', user: { id: 'u1', isAdmin: false } });
    const handler: CallHandler = { handle: () => of({ cost_price: 100 }) };
    const result = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ cost_price: 100 });
    expect(permService.getFieldPermissions).not.toHaveBeenCalled();
  });

  it('skips is_admin users', async () => {
    const ctx = mockContext({
      url: '/api/apps/purchase/models/order/data/1',
      user: { id: 'u1', isAdmin: true },
    });
    const handler: CallHandler = { handle: () => of({ cost_price: 100 }) };
    const result = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ cost_price: 100 });
    expect(permService.getFieldPermissions).not.toHaveBeenCalled();
  });

  it('strips hidden fields from list response', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm1',
      fields: [
        { id: 'f1', columnName: 'cost_price' },
        { id: 'f2', columnName: 'name' },
      ],
    });
    permService.getFieldPermissions.mockResolvedValue(new Map([['f1', 'hidden']]));
    const ctx = mockContext({
      url: '/api/apps/purchase/models/order/data',
      user: { id: 'u1', isAdmin: false },
    });
    const handler: CallHandler = {
      handle: () => of({ items: [{ id: '1', name: 'A', cost_price: 100 }], total: 1 }),
    };
    const result: any = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result.items[0]).toEqual({ id: '1', name: 'A' });
    expect(result.items[0].cost_price).toBeUndefined();
  });

  it('strips hidden and readonly fields from write body', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm1',
      fields: [
        { id: 'f1', columnName: 'cost_price' },
        { id: 'f2', columnName: 'state' },
        { id: 'f3', columnName: 'name' },
      ],
    });
    permService.getFieldPermissions.mockResolvedValue(
      new Map([['f1', 'hidden'], ['f2', 'readonly']]),
    );
    const body = { name: 'A', cost_price: 100, state: 'done' };
    const ctx = mockContext({
      method: 'PUT',
      url: '/api/apps/purchase/models/order/data/1',
      user: { id: 'u1', isAdmin: false },
      body,
    });
    const handler: CallHandler = { handle: () => of({ id: '1' }) };
    await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(body).toEqual({ name: 'A' });
  });

  it('keeps readonly fields on read but strips hidden from read', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm1',
      fields: [
        { id: 'f1', columnName: 'cost_price' },
        { id: 'f2', columnName: 'state' },
      ],
    });
    permService.getFieldPermissions.mockResolvedValue(
      new Map([['f1', 'hidden'], ['f2', 'readonly']]),
    );
    const ctx = mockContext({
      url: '/api/apps/purchase/models/order/data/1',
      user: { id: 'u1', isAdmin: false },
    });
    const handler: CallHandler = {
      handle: () => of({ id: '1', cost_price: 100, state: 'done' }),
    };
    const result: any = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ id: '1', state: 'done' });
  });

  it('applies to /api/designer/.../data paths as well', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm1',
      fields: [{ id: 'f1', columnName: 'cost_price' }],
    });
    permService.getFieldPermissions.mockResolvedValue(new Map([['f1', 'hidden']]));
    const ctx = mockContext({
      url: '/api/designer/apps/purchase/models/order/data',
      user: { id: 'u1', isAdmin: false },
    });
    const handler: CallHandler = {
      handle: () => of({ items: [{ id: '1', cost_price: 100 }], total: 1 }),
    };
    const result: any = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result.items[0]).toEqual({ id: '1' });
  });
});
