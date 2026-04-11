import { Body, Controller, Delete, Get, Inject, Put, Query } from '@nestjs/common';
import { FieldPermissionService } from './field-permission.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  UpsertFieldPermissionDto,
  DeleteFieldPermissionDto,
} from './dto/upsert-field-permission.dto';

@Controller('api/field-permissions')
export class FieldPermissionController {
  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(@Inject(FieldPermissionService) private fpService: FieldPermissionService) {}

  @Get()
  @RequirePermission('sys:roles', 'view')
  async list(
    @Query('roleId') roleId: string,
    @Query('modelId') modelId: string,
  ) {
    return this.fpService.list(roleId, modelId);
  }

  @Put()
  @RequirePermission('sys:roles', 'edit')
  async upsert(@Body() dto: UpsertFieldPermissionDto) {
    return this.fpService.upsert(dto);
  }

  @Delete()
  @RequirePermission('sys:roles', 'edit')
  async remove(@Body() dto: DeleteFieldPermissionDto) {
    await this.fpService.delete(dto.roleId, dto.fieldId);
    return { ok: true };
  }
}
