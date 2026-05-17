import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

export interface CreateNotificationInput {
  userId: string;
  orgId?: string;
  type: string;
  title: string;
  body?: string;
  relatedType?: string;
  relatedId?: string;
  navigateTo?: string;
  data?: any;
}

export interface ListNotificationsParams {
  since?: Date;
  type?: string;
  isRead?: boolean;
  limit?: number;
}

@Injectable()
export class NotificationService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventBus: EventEmitter2,
  ) {}

  async create(input: CreateNotificationInput) {
    const row = await this.prisma.sysNotification.create({ data: input });
    this.eventBus.emit('notification.created', row);
    return row;
  }

  async createMany(inputs: CreateNotificationInput[]) {
    const rows: any[] = [];
    for (const input of inputs) {
      const row = await this.prisma.sysNotification.create({ data: input });
      this.eventBus.emit('notification.created', row);
      rows.push(row);
    }
    return rows;
  }

  async list(userId: string, params: ListNotificationsParams = {}) {
    return this.prisma.sysNotification.findMany({
      where: {
        userId,
        ...(params.type && { type: params.type }),
        ...(params.isRead !== undefined && { isRead: params.isRead }),
        ...(params.since && { createdAt: { gt: params.since } }),
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
    });
  }

  async markRead(id: string, userId: string) {
    const row = await this.prisma.sysNotification.findFirst({ where: { id, userId } });
    if (!row) {
      throw new BusinessException(
        404,
        ErrorCodes.NOTIFICATION_NOT_FOUND,
        'Notification not found',
      );
    }
    if (row.isRead) return row;
    return this.prisma.sysNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string, type?: string) {
    return this.prisma.sysNotification.updateMany({
      where: { userId, isRead: false, ...(type && { type }) },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.sysNotification.count({ where: { userId, isRead: false } });
  }
}
