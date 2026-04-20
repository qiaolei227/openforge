import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Request,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { DynamicDataService } from './dynamic-data.service';
import { DataStatusService } from './data-status.service';
import { DistributionService } from './distribution.service';
import { SyncService } from './sync.service';
import { AutoDistributeService } from './auto-distribute.service';
import { QueryDto } from './dto/query.dto';
import { BatchDto } from './dto/batch.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-context';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { DistributedGuard } from './distributed.guard';

@UseGuards(DistributedGuard)
@Controller('apps/:appCode/models/:modelCode/data')
export class DynamicDataController {
  constructor(
    @Inject(DynamicDataService) private dynamicDataService: DynamicDataService,
    @Inject(DataStatusService) private dataStatusService: DataStatusService,
    @Inject(DistributionService) private distributionService: DistributionService,
    @Inject(SyncService) private syncService: SyncService,
    @Inject(AutoDistributeService) private autoDistribute: AutoDistributeService,
  ) {}

  @Post('query')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
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

  @Get('status-counts')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
  async statusCounts(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.statusCounts(appCode, modelCode, user.orgId);
  }

  @Get('schema')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
  getSchema(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.getSchema(appCode, modelCode, user);
  }

  @Get('distribution-status')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
  distributionStatus(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Query('recordIds') recordIds: string,
  ) {
    const ids = (recordIds ?? '').split(',').filter(Boolean);
    return this.distributionService.getDistributionStatus(appCode, modelCode, ids);
  }

  @Get(':id')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
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
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'create',
  )
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
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'edit',
  )
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
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'archive',
  )
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

  @Put(':id/status')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'edit',
  )
  async transitionStatus(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @Body() body: { action: string },
    @Request() req: any,
  ) {
    const model = await this.dynamicDataService.getModelByAppAndCode(appCode, modelCode);
    if (!model.enableDataStatus) {
      throw new BusinessException(400, ErrorCodes.DATA_STATUS_NOT_ENABLED, 'Data status not enabled for this model');
    }
    await this.dataStatusService.transition(
      model.tableName,
      id,
      body.action as any,
      req.user.userId,
      req.user.isAdmin,
    );
    return { success: true };
  }

  @Delete(':id')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'delete',
  )
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
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'edit',
  )
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

  @Post('distribute')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'distribute',
  )
  distribute(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Body() body: { recordIds: string[]; changes: Array<{ orgId: string; action: 'allocate' | 'revoke' }> },
    @CurrentUser() user: RequestUser,
  ) {
    return this.distributionService.applyChanges(appCode, modelCode, {
      user,
      recordIds: body.recordIds,
      changes: body.changes,
    });
  }

  @Post('fill-missing-copies')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'distribute',
  )
  fillMissingCopies(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.autoDistribute.fillMissing(appCode, modelCode, user);
  }

  @Post(':id/sync')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'distribute',
  )
  sync(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @Body() body: { action: 'force_push' | 'backfill'; fieldColumns: string[]; confirmationPhrase: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.syncService.sync(appCode, modelCode, id, {
      user,
      action: body.action,
      fieldColumns: body.fieldColumns,
      confirmationPhrase: body.confirmationPhrase,
    });
  }

  @Get(':id/distribution-log')
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
  distributionLog(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    return this.distributionService.getDistributionLog(
      appCode,
      modelCode,
      id,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }
}
