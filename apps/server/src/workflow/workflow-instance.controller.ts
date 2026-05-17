import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowUrgeService } from './workflow-urge.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('workflow-instances')
export class WorkflowInstanceController {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(WorkflowEngineService) private engine: WorkflowEngineService,
    @Inject(WorkflowUrgeService) private urge: WorkflowUrgeService,
  ) {}

  @Get(':id')
  @RequirePermission('sys:self', 'view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const instance = await this.prisma.sysWorkflowInstance.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
        workflowVersion: true,
        workflow: true,
      },
    });
    if (!instance) {
      throw new BusinessException(
        404,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND,
        'Instance not found',
      );
    }
    return instance;
  }

  @Post(':id/withdraw')
  @RequirePermission('sys:self', 'edit')
  withdraw(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.engine.withdraw(id, { userId: req.user.userId, orgId: req.user.orgId });
  }

  @Post(':id/urge')
  @RequirePermission('sys:self', 'edit')
  urgeInstance(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.urge.urge(id, { userId: req.user.userId, orgId: req.user.orgId });
  }
}
