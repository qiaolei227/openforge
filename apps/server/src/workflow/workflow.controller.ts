import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowVersionService } from './workflow-version.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { PublishVersionDto } from './dto/publish-version.dto';
import { ReorderWorkflowsDto } from './dto/reorder-workflows.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller()
export class WorkflowController {
  constructor(
    @Inject(WorkflowService) private workflowService: WorkflowService,
    @Inject(WorkflowVersionService) private versionService: WorkflowVersionService,
  ) {}

  @Get('apps/:appCode/models/:modelCode/workflows')
  @RequirePermission('designer:workflow', 'view')
  list(@Param('appCode') a: string, @Param('modelCode') m: string) {
    return this.workflowService.list(a, m);
  }

  @Get('workflows/:id')
  @RequirePermission('designer:workflow', 'view')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowService.findById(id);
  }

  @Post('apps/:appCode/models/:modelCode/workflows')
  @RequirePermission('designer:workflow', 'create')
  create(
    @Param('appCode') a: string,
    @Param('modelCode') m: string,
    @Body() dto: CreateWorkflowDto,
    @Req() req: any,
  ) {
    return this.workflowService.create(a, m, dto, req.user.userId);
  }

  @Patch('workflows/:id')
  @RequirePermission('designer:workflow', 'edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflowService.update(id, dto);
  }

  @Delete('workflows/:id')
  @RequirePermission('designer:workflow', 'delete')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowService.delete(id);
  }

  @Post('workflows/reorder')
  @RequirePermission('designer:workflow', 'edit')
  reorder(@Body() dto: ReorderWorkflowsDto) {
    return this.workflowService.reorder(dto.items);
  }

  @Post('workflows/:id/versions')
  @RequirePermission('designer:workflow', 'edit')
  publishVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishVersionDto,
    @Req() req: any,
  ) {
    return this.versionService.publish(id, dto.definition, req.user.userId);
  }

  @Get('workflows/:id/versions')
  @RequirePermission('designer:workflow', 'view')
  listVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.versionService.listVersions(id);
  }

  @Post('workflows/:id/versions/:versionId/activate')
  @RequirePermission('designer:workflow', 'edit')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) v: string,
  ) {
    return this.versionService.activate(id, v);
  }
}
