import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from '../notification.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: any;
  let eventBus: any;

  beforeEach(() => {
    prisma = {
      sysNotification: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
    };
    eventBus = { emit: vi.fn() };
    service = new NotificationService(prisma as any, eventBus as any);
  });

  describe('create', () => {
    it('persists a row and emits notification.created', async () => {
      const input = {
        userId: 'u1',
        type: 'workflow.assigned',
        title: 'New task',
      };
      const row = { id: 'n1', ...input };
      prisma.sysNotification.create.mockResolvedValue(row);

      const result = await service.create(input);

      expect(prisma.sysNotification.create).toHaveBeenCalledWith({ data: input });
      expect(eventBus.emit).toHaveBeenCalledWith('notification.created', row);
      expect(result).toEqual(row);
    });
  });

  describe('createMany', () => {
    it('batch creates and emits per row', async () => {
      const inputs = [
        { userId: 'u1', type: 'workflow.assigned', title: 'Task 1' },
        { userId: 'u2', type: 'workflow.assigned', title: 'Task 2' },
      ];
      prisma.sysNotification.create
        .mockResolvedValueOnce({ id: 'n1', ...inputs[0] })
        .mockResolvedValueOnce({ id: 'n2', ...inputs[1] });

      const result = await service.createMany(inputs);

      expect(prisma.sysNotification.create).toHaveBeenCalledTimes(2);
      expect(eventBus.emit).toHaveBeenCalledTimes(2);
      expect(eventBus.emit).toHaveBeenNthCalledWith(
        1,
        'notification.created',
        expect.objectContaining({ id: 'n1' }),
      );
      expect(eventBus.emit).toHaveBeenNthCalledWith(
        2,
        'notification.created',
        expect.objectContaining({ id: 'n2' }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('list', () => {
    it('filters by userId, type, isRead, since with limit', async () => {
      prisma.sysNotification.findMany.mockResolvedValue([]);
      const since = new Date('2026-05-01T00:00:00Z');

      await service.list('u1', {
        type: 'workflow.assigned',
        isRead: false,
        since,
        limit: 20,
      });

      expect(prisma.sysNotification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          type: 'workflow.assigned',
          isRead: false,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });

    it('defaults limit to 50 when not provided', async () => {
      prisma.sysNotification.findMany.mockResolvedValue([]);

      await service.list('u1');

      expect(prisma.sysNotification.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('markRead', () => {
    it('throws NOTIFICATION_NOT_FOUND when notification belongs to another user', async () => {
      prisma.sysNotification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('n1', 'u-other')).rejects.toMatchObject({
        errorCode: ErrorCodes.NOTIFICATION_NOT_FOUND,
      });
      expect(prisma.sysNotification.update).not.toHaveBeenCalled();
    });

    it('is idempotent when notification is already read', async () => {
      const row = { id: 'n1', userId: 'u1', isRead: true, readAt: new Date() };
      prisma.sysNotification.findFirst.mockResolvedValue(row);

      const result = await service.markRead('n1', 'u1');

      expect(prisma.sysNotification.update).not.toHaveBeenCalled();
      expect(result).toBe(row);
    });

    it('sets isRead=true and readAt=now when owner matches', async () => {
      const row = { id: 'n1', userId: 'u1', isRead: false };
      prisma.sysNotification.findFirst.mockResolvedValue(row);
      prisma.sysNotification.update.mockResolvedValue({
        ...row,
        isRead: true,
        readAt: new Date(),
      });

      const result = await service.markRead('n1', 'u1');

      expect(prisma.sysNotification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      });
      expect(result.isRead).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('mass updates unread notifications for user', async () => {
      prisma.sysNotification.updateMany.mockResolvedValue({ count: 3 });

      await service.markAllRead('u1');

      expect(prisma.sysNotification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
        data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      });
    });

    it('supports optional type filter', async () => {
      prisma.sysNotification.updateMany.mockResolvedValue({ count: 1 });

      await service.markAllRead('u1', 'workflow.assigned');

      expect(prisma.sysNotification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false, type: 'workflow.assigned' },
        data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of unread notifications for user', async () => {
      prisma.sysNotification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount('u1');

      expect(prisma.sysNotification.count).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
      });
      expect(result).toBe(7);
    });
  });
});
