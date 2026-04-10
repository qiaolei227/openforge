import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { DynamicDataService } from './dynamic-data.service';
import { QueryDto } from './dto/query.dto';
import { BatchDto } from './dto/batch.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-context';

@Controller('apps/:appCode/models/:modelCode/data')
export class DynamicDataController {
  constructor(private dynamicDataService: DynamicDataService) {}

  @Post('query')
  query(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Body() queryDto: QueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.query(
      appCode,
      modelCode,
      queryDto,
      user.orgId,
    );
  }

  @Get(':id')
  findById(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.findById(
      appCode,
      modelCode,
      id,
      user.orgId,
    );
  }

  @Post()
  create(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Body() data: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.create(
      appCode,
      modelCode,
      data,
      user.userId,
      user.orgId,
    );
  }

  @Put(':id')
  update(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @Body() data: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.update(
      appCode,
      modelCode,
      id,
      data,
      user.userId,
      user.orgId,
    );
  }

  @Put(':id/archive')
  async archive(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @Body('archived') archived: boolean,
    @CurrentUser() user: RequestUser,
  ) {
    await this.dynamicDataService.archive(
      appCode,
      modelCode,
      id,
      archived,
      user,
    );
    return { success: true };
  }

  @Delete(':id')
  remove(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.delete(
      appCode,
      modelCode,
      id,
      user.orgId,
    );
  }

  @Post('batch')
  batch(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Body() batchDto: BatchDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.batch(
      appCode,
      modelCode,
      batchDto,
      user.userId,
      user.orgId,
    );
  }
}
