import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { CurrentOrgInterceptor } from '../current-org.interceptor';

function mockContext(headers: Record<string, string>, user: any): ExecutionContext {
  const req = { headers, user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}
const next: CallHandler = { handle: () => of(null) };

describe('CurrentOrgInterceptor', () => {
  let prisma: any;
  let interceptor: CurrentOrgInterceptor;
  beforeEach(() => {
    prisma = { sysUserOrg: { findFirst: vi.fn() } };
    interceptor = new CurrentOrgInterceptor(prisma);
  });

  it('reads X-Current-Org-Id header and injects into user.orgId after membership check', async () => {
    prisma.sysUserOrg.findFirst.mockResolvedValue({ userId: 'u1', orgId: 'orgA' });
    const ctx = mockContext({ 'x-current-org-id': 'orgA' }, { userId: 'u1', orgId: 'orgX', isAdmin: false });
    await new Promise((res) => interceptor.intercept(ctx, next).subscribe({ complete: () => res(null) }));
    const req = ctx.switchToHttp().getRequest();
    expect(req.user.orgId).toBe('orgA');
  });

  it('falls back to sys_user_org.isDefault when header missing', async () => {
    prisma.sysUserOrg.findFirst.mockResolvedValue({ userId: 'u1', orgId: 'defaultOrg', isDefault: true });
    const ctx = mockContext({}, { userId: 'u1', orgId: 'orgX', isAdmin: false });
    await new Promise((res) => interceptor.intercept(ctx, next).subscribe({ complete: () => res(null) }));
    expect(prisma.sysUserOrg.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', isDefault: true } });
    expect(ctx.switchToHttp().getRequest().user.orgId).toBe('defaultOrg');
  });

  it('throws ORG_ACCESS_DENIED when membership check fails', async () => {
    prisma.sysUserOrg.findFirst.mockResolvedValue(null);
    const ctx = mockContext({ 'x-current-org-id': 'orgA' }, { userId: 'u1', orgId: 'orgX', isAdmin: false });
    await expect(
      new Promise((res, rej) => interceptor.intercept(ctx, next).subscribe({ error: rej, complete: () => res(null) })),
    ).rejects.toMatchObject({ errorCode: 'ORG_ACCESS_DENIED' });
  });

  it('admin bypasses membership check', async () => {
    const ctx = mockContext({ 'x-current-org-id': 'anyOrg' }, { userId: 'u1', orgId: 'orgX', isAdmin: true });
    await new Promise((res) => interceptor.intercept(ctx, next).subscribe({ complete: () => res(null) }));
    expect(ctx.switchToHttp().getRequest().user.orgId).toBe('anyOrg');
    expect(prisma.sysUserOrg.findFirst).not.toHaveBeenCalled();
  });

  it('skips all work when request has no user (unauthenticated / @Public)', async () => {
    const ctx = mockContext({ 'x-current-org-id': 'orgA' }, undefined);
    await new Promise((res) => interceptor.intercept(ctx, next).subscribe({ complete: () => res(null) }));
    expect(prisma.sysUserOrg.findFirst).not.toHaveBeenCalled();
  });
});
