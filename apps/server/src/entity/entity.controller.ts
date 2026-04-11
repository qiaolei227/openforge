import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EntityService } from './entity.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller()
export class EntityController {
  constructor(private entityService: EntityService) {}

  @Get('models/:modelId/entities')
  @RequirePermission('sys:designer', 'view')
  findByModelId(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.entityService.findByModelId(modelId);
  }

  @Post('models/:modelId/entities')
  @RequirePermission('sys:designer', 'create')
  create(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() dto: CreateEntityDto,
  ) {
    return this.entityService.create(modelId, dto);
  }

  @Put('entities/:id')
  @RequirePermission('sys:designer', 'edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEntityDto,
  ) {
    return this.entityService.update(id, dto);
  }

  @Put('models/:modelId/entities/sort')
  @RequirePermission('sys:designer', 'edit')
  updateSort(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() items: Array<{ id: string; sortOrder: number }>,
  ) {
    return this.entityService.updateSort(modelId, items);
  }

  @Get('entities/:id/records')
  @RequirePermission('sys:designer', 'view')
  queryRecords(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('parentId', ParseUUIDPipe) parentId: string,
  ) {
    return this.entityService.queryRecords(id, parentId);
  }

  @Delete('entities/:id')
  @RequirePermission('sys:designer', 'delete')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('force') force?: string,
  ) {
    return this.entityService.delete(id, force === 'true');
  }
}
