import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MenuService } from './menu.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { ReorderMenuDto } from './dto/reorder-menu.dto';

@Controller('api/menus')
export class MenuController {
  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(@Inject(MenuService) private menuService: MenuService) {}

  /**
   * Menu tree visible to the current user.
   * sys:self is a virtual permission that grants view access to any authenticated user —
   * see PermissionService.check() for the bypass rule.
   */
  @Get('tree')
  @RequirePermission('sys:self', 'view')
  async getTree(@Req() req: Request) {
    const user = (req as any).user;
    return this.menuService.buildTreeForUser({ id: user.id, isAdmin: !!user.isAdmin });
  }

  @Get('admin/tree')
  @RequirePermission('sys:menus', 'view')
  async getAdminTree() {
    return this.menuService.getAdminTree();
  }

  @Post()
  @RequirePermission('sys:menus', 'create')
  async create(@Body() dto: CreateMenuDto) {
    return this.menuService.create(dto);
  }

  @Put(':id')
  @RequirePermission('sys:menus', 'edit')
  async update(@Param('id') id: string, @Body() dto: UpdateMenuDto) {
    return this.menuService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('sys:menus', 'delete')
  async remove(@Param('id') id: string) {
    await this.menuService.delete(id);
    return { ok: true };
  }

  @Post('reorder')
  @RequirePermission('sys:menus', 'edit')
  async reorder(@Body() dto: ReorderMenuDto) {
    await this.menuService.reorder(dto);
    return { ok: true };
  }
}
