import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { RoleService } from './role.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('api/roles')
export class RoleController {
  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(@Inject(RoleService) private roleService: RoleService) {}

  @Get()
  @RequirePermission('sys:roles', 'view')
  async list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.roleService.list({
      keyword,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get(':id')
  @RequirePermission('sys:roles', 'view')
  async findOne(@Param('id') id: string) {
    return this.roleService.findById(id);
  }

  @Post()
  @RequirePermission('sys:roles', 'create')
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Put(':id')
  @RequirePermission('sys:roles', 'edit')
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('sys:roles', 'delete')
  async remove(@Param('id') id: string) {
    await this.roleService.delete(id);
    return { ok: true };
  }
}
