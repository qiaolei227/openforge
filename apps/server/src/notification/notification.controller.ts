import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ListNotificationsDto } from './dto/list-notifications.dto';

@Controller('notifications')
export class NotificationController {
  constructor(@Inject(NotificationService) private service: NotificationService) {}

  @Get()
  @RequirePermission('sys:self', 'view')
  list(@Req() req: any, @Query() query: ListNotificationsDto) {
    return this.service.list(req.user.userId, {
      type: query.type,
      isRead: query.isRead === undefined ? undefined : query.isRead === 'true',
      since: query.since ? new Date(query.since) : undefined,
      limit: query.limit,
    });
  }

  @Get('unread-count')
  @RequirePermission('sys:self', 'view')
  async unreadCount(@Req() req: any) {
    return { count: await this.service.getUnreadCount(req.user.userId) };
  }

  @Patch(':id/read')
  @RequirePermission('sys:self', 'edit')
  read(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.markRead(id, req.user.userId);
  }

  @Post('read-all')
  @RequirePermission('sys:self', 'edit')
  readAll(@Req() req: any, @Body() body: { type?: string }) {
    return this.service.markAllRead(req.user.userId, body?.type);
  }
}
