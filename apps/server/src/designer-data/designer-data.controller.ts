import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { DynamicDataService } from '../dynamic-data/dynamic-data.service';
import { QueryDto } from '../dynamic-data/dto/query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-context';

/**
 * Designer 数据 Tab — 仅用于设计态下的样本数据预览。
 *
 * 与 /api/apps/:appCode/models/:modelCode/data 的区别：
 * - 权限要求 sys:designer.view（而不是 menu:model:*）
 * - 仅暴露查询类动作（POST /query 和 GET /:id），不暴露写入
 * - 强制 pageSize 上限 50
 * - 仍然经过 FieldPermissionInterceptor 过滤（BA 的角色字段权限生效）
 *
 * POST /query 的 HTTP 语义与 DynamicDataController 保持一致（body 承载复杂
 * filter DTO 是项目既有约定，避免 GET + body 的反模式）。
 */
@Controller('api/designer/apps/:appCode/models/:modelCode/data')
export class DesignerDataController {
  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(
    @Inject(DynamicDataService) private dynamicDataService: DynamicDataService,
  ) {}

  @Post('query')
  @RequirePermission('sys:designer', 'view')
  async query(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Body() queryDto: QueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const cappedQuery: QueryDto = {
      ...queryDto,
      page: 1,
      pageSize: Math.min(queryDto?.pageSize ?? 50, 50),
    };
    return this.dynamicDataService.query(appCode, modelCode, cappedQuery, user.orgId);
  }

  @Get(':id')
  @RequirePermission('sys:designer', 'view')
  async findOne(
    @Param('appCode') appCode: string,
    @Param('modelCode') modelCode: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dynamicDataService.findById(appCode, modelCode, id, user.orgId);
  }
}
