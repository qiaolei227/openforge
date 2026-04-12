import { Controller, Get, Inject } from '@nestjs/common';
import { AccessibleAppsService } from './accessible-apps.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interfaces/request-context';

@Controller('accessible-apps')
export class AccessibleAppsController {
  constructor(
    @Inject(AccessibleAppsService) private readonly service: AccessibleAppsService,
  ) {}

  /** GET /api/accessible-apps */
  @Get()
  @RequirePermission('sys:self', 'view')
  list(@CurrentUser() user: RequestUser) {
    return this.service.listForUser({
      userId: user.userId,
      isAdmin: user.isAdmin,
    });
  }
}
