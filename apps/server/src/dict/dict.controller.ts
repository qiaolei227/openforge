import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DictService } from './dict.service';
import { CreateDictDto } from './dto/create-dict.dto';
import { UpdateDictDto } from './dto/update-dict.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';

@Controller()
export class DictController {
  constructor(private dictService: DictService) {}

  @Get('apps/:appId/dicts')
  findByAppId(@Param('appId', ParseUUIDPipe) appId: string) {
    return this.dictService.findByAppId(appId);
  }

  @Get('dicts/:id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.dictService.findById(id);
  }

  @Post('apps/:appId/dicts')
  create(
    @Param('appId', ParseUUIDPipe) appId: string,
    @Body() dto: CreateDictDto,
  ) {
    return this.dictService.create(appId, dto);
  }

  @Put('dicts/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDictDto,
  ) {
    return this.dictService.update(id, dto);
  }

  @Delete('dicts/:id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.dictService.delete(id);
  }

  @Post('dicts/:dictId/items')
  createItem(
    @Param('dictId', ParseUUIDPipe) dictId: string,
    @Body() dto: CreateDictItemDto,
  ) {
    return this.dictService.createItem(dictId, dto);
  }

  @Put('dict-items/:id')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDictItemDto,
  ) {
    return this.dictService.updateItem(id, dto);
  }

  @Delete('dict-items/:id')
  deleteItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.dictService.deleteItem(id);
  }

  @Put('dicts/:dictId/items/sort')
  sortItems(
    @Param('dictId', ParseUUIDPipe) dictId: string,
    @Body() items: Array<{ id: string; sortOrder: number }>,
  ) {
    return this.dictService.sortItems(dictId, items);
  }
}
