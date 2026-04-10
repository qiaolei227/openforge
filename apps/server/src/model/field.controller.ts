import { Controller, Get, Post, Put, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { FieldService } from './field.service';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';

@Controller()
export class FieldController {
  constructor(private fieldService: FieldService) {}

  @Get('models/:modelId/fields')
  findByModelId(
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.fieldService.findByModelId(modelId);
  }

  @Post('models/:modelId/fields')
  create(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() dto: CreateFieldDto,
  ) {
    return this.fieldService.create(modelId, dto);
  }

  @Get('fields/:id/null-count')
  nullCount(@Param('id', ParseUUIDPipe) id: string) {
    return this.fieldService.getNullCount(id);
  }

  @Put('fields/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFieldDto,
  ) {
    return this.fieldService.update(id, dto);
  }

  @Delete('fields/:id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.fieldService.delete(id);
  }

  @Put('models/:modelId/fields/sort')
  updateSort(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() items: Array<{ id: string; sortOrder: number }>,
  ) {
    return this.fieldService.updateSort(modelId, items);
  }
}
