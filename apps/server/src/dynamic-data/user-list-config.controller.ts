import { Controller, Get, Put, Delete, Param, Body, Inject } from '@nestjs/common';
import { UserListConfigService } from './user-list-config.service';
import { DynamicDataService } from './dynamic-data.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-context';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('apps/:appCode/models/:modelCode/user-config')
export class UserListConfigController {
  constructor(
    @Inject(UserListConfigService) private configService: UserListConfigService,
    @Inject(DynamicDataService) private dynamicDataService: DynamicDataService,
  ) {}

  @Get()
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
  async get(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @CurrentUser() user: RequestUser,
  ) {
    const model = await this.dynamicDataService.getModelByAppAndCode(appCode, modelCode);
    return this.configService.get(user.userId, model.id);
  }

  @Put()
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
  async upsert(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Body() config: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    const model = await this.dynamicDataService.getModelByAppAndCode(appCode, modelCode);
    return this.configService.upsert(user.userId, model.id, config);
  }

  @Delete()
  @RequirePermission(
    (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
    'view',
  )
  async remove(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @CurrentUser() user: RequestUser,
  ) {
    const model = await this.dynamicDataService.getModelByAppAndCode(appCode, modelCode);
    await this.configService.remove(user.userId, model.id);
    return { success: true };
  }
}
