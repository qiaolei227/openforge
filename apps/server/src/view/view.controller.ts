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
import { ViewService } from './view.service';
import { CreateViewDto } from './dto/create-view.dto';
import { UpdateViewDto } from './dto/update-view.dto';

@Controller()
export class ViewController {
  constructor(private viewService: ViewService) {}

  @Get('models/:modelId/views')
  findByModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.viewService.findByModel(modelId);
  }

  @Get('views/:id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.viewService.findById(id);
  }

  @Post('models/:modelId/views')
  create(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() dto: CreateViewDto,
  ) {
    return this.viewService.create(modelId, dto);
  }

  @Put('views/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateViewDto) {
    return this.viewService.update(id, dto);
  }

  @Put('views/:id/set-default')
  setDefault(@Param('id', ParseUUIDPipe) id: string) {
    return this.viewService.setDefault(id);
  }

  @Delete('views/:id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.viewService.delete(id);
  }
}
