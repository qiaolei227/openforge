import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { AppMgmtService } from './app-mgmt.service';
import { CreateAppDto } from './dto/create-app.dto';
import { UpdateAppDto } from './dto/update-app.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('apps')
export class AppMgmtController {
  constructor(private appMgmtService: AppMgmtService) {}

  @Get()
  @RequirePermission('sys:designer', 'view')
  findAll(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.appMgmtService.findAll({
      keyword,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('sys:designer', 'view')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.appMgmtService.findById(id);
  }

  @Post()
  @RequirePermission('sys:designer', 'create')
  create(@Body() dto: CreateAppDto) {
    return this.appMgmtService.create(dto);
  }

  @Put(':id')
  @RequirePermission('sys:designer', 'edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAppDto) {
    return this.appMgmtService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('sys:designer', 'delete')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.appMgmtService.delete(id);
  }
}
