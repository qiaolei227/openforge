import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { OrgService } from './org.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('orgs')
export class OrgController {
  constructor(private orgService: OrgService) {}

  @Get()
  @RequirePermission('sys:orgs', 'view')
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orgService.findAll({
      keyword,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('tree')
  @RequirePermission('sys:orgs', 'view')
  findTree() {
    return this.orgService.findTree();
  }

  @Get('tree/children')
  @RequirePermission('sys:orgs', 'view')
  findTreeChildren(
    @Query('parentId') parentId?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.orgService.findChildren(parentId || null, keyword);
  }

  @Get('accessible')
  @RequirePermission('sys:self', 'view')
  getAccessible(@CurrentUser() user: any) {
    return this.orgService.getAccessibleOrgs(user.userId, user.isAdmin);
  }

  @Get(':id')
  @RequirePermission('sys:orgs', 'view')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.findById(id);
  }

  @Post()
  @RequirePermission('sys:orgs', 'create')
  create(@Body() dto: CreateOrgDto, @CurrentUser('userId') userId: string) {
    return this.orgService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermission('sys:orgs', 'edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrgDto) {
    return this.orgService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('sys:orgs', 'delete')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.delete(id);
  }
}
