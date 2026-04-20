import { Controller, Get, Post, Put, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { FieldService } from './field.service';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller()
export class FieldController {
  constructor(private fieldService: FieldService) {}

  @Get('models/:modelId/fields')
  @RequirePermission('sys:designer', 'view')
  findByModelId(
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.fieldService.findByModelId(modelId);
  }

  @Post('models/:modelId/fields')
  @RequirePermission('sys:designer', 'create')
  create(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() dto: CreateFieldDto,
  ) {
    return this.fieldService.create(modelId, dto);
  }

  @Get('fields/:id/null-count')
  @RequirePermission('sys:designer', 'view')
  nullCount(@Param('id', ParseUUIDPipe) id: string) {
    return this.fieldService.getNullCount(id);
  }

  @Put('fields/:id')
  @RequirePermission('sys:designer', 'edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFieldDto,
  ) {
    return this.fieldService.update(id, dto);
  }

  @Delete('fields/:id')
  @RequirePermission('sys:designer', 'delete')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.fieldService.delete(id);
  }

  @Put('models/:modelId/fields/sort')
  @RequirePermission('sys:designer', 'edit')
  updateSort(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() items: Array<{ id: string; sortOrder: number }>,
  ) {
    return this.fieldService.updateSort(modelId, items);
  }

  @Get('apps/:appCode/models/:modelCode/fields/:fieldId/local-edits-count')
  @RequirePermission('sys:designer', 'view')
  localEditsCount(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
  ) {
    return this.fieldService.getLocalEditsCount(appCode, modelCode, fieldId);
  }
}
