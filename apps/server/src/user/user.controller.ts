import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  @RequirePermission('sys:users', 'view')
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('orgId') orgId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.userService.findAll({
      keyword,
      status,
      orgId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('sys:users', 'view')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findById(id);
  }

  @Post()
  @RequirePermission('sys:users', 'create')
  create(@Body() dto: CreateUserDto, @CurrentUser('userId') userId: string) {
    return this.userService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermission('sys:users', 'edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('sys:users', 'delete')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.delete(id);
  }

  @Put(':id/roles')
  @RequirePermission('sys:users', 'edit')
  async setRoles(@Param('id') id: string, @Body() dto: SetUserRolesDto) {
    return this.userService.setRoles(id, dto);
  }

  @Get(':id/roles')
  @RequirePermission('sys:users', 'view')
  async getRoles(@Param('id') id: string) {
    return this.userService.getUserRoles(id);
  }
}
