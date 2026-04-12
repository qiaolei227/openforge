import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { RolePermissionService } from './role-permission.service';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { RevokePermissionDto } from './dto/revoke-permission.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('role-permissions')
export class RolePermissionController {
  constructor(@Inject(RolePermissionService) private readonly service: RolePermissionService) {}

  @Get('by-role/:roleId')
  @RequirePermission('platform:roles', 'view')
  list(@Param('roleId') roleId: string) {
    return this.service.listByRole(roleId);
  }

  @Post('by-role/:roleId')
  @RequirePermission('platform:roles', 'edit')
  grant(@Param('roleId') roleId: string, @Body() dto: GrantPermissionDto) {
    return this.service.grant(roleId, dto);
  }

  @Delete('by-role/:roleId')
  @HttpCode(204)
  @RequirePermission('platform:roles', 'edit')
  async revoke(@Param('roleId') roleId: string, @Body() dto: RevokePermissionDto) {
    await this.service.revoke(roleId, dto);
  }
}
