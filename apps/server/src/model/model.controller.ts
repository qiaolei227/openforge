import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ModelService } from './model.service';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('models')
export class ModelController {
  constructor(private modelService: ModelService) {}

  @Get()
  @RequirePermission('sys:designer', 'view')
  findAll(
    @Query('appId') appId?: string,
    @Query('keyword') keyword?: string,
    @Query('dataScope') dataScope?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.modelService.findAll({
      appId,
      keyword,
      dataScope,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('sys:designer', 'view')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.modelService.findById(id);
  }

  @Post()
  @RequirePermission('sys:designer', 'create')
  create(
    @Body() dto: CreateModelDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.modelService.create(dto, userId);
  }

  @Put(':id')
  @RequirePermission('sys:designer', 'edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModelDto) {
    return this.modelService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('sys:designer', 'delete')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.modelService.delete(id);
  }
}
