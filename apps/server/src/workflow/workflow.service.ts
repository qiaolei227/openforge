import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowConditionMatcher } from './workflow-condition-matcher.service';
import { ConditionExpression } from './types';

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(WorkflowConditionMatcher) private matcher: WorkflowConditionMatcher,
  ) {}

  async list(appCode: string, modelCode: string) {
    const model = await this.findModel(appCode, modelCode);
    return this.prisma.sysWorkflow.findMany({
      where: { modelId: model.id },
      orderBy: { sortOrder: 'asc' },
      include: { currentVersion: true, _count: { select: { instances: true } } },
    });
  }

  async create(
    appCode: string,
    modelCode: string,
    dto: CreateWorkflowDto,
    userId: string,
  ) {
    const model = await this.findModel(appCode, modelCode);
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(model.id));
    return this.prisma.sysWorkflow.create({
      data: {
        modelId: model.id,
        name: dto.name,
        description: dto.description,
        sortOrder,
        enabled: dto.enabled ?? true,
        condition: dto.condition ?? null,
        createdBy: userId,
      },
    });
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    const wf = await this.prisma.sysWorkflow.findUnique({ where: { id } });
    if (!wf)
      throw new BusinessException(404, ErrorCodes.WORKFLOW_NOT_FOUND, 'Workflow not found');
    return this.prisma.sysWorkflow.update({ where: { id }, data: dto as any });
  }

  async delete(id: string) {
    const wf = await this.prisma.sysWorkflow.findUnique({ where: { id } });
    if (!wf)
      throw new BusinessException(404, ErrorCodes.WORKFLOW_NOT_FOUND, 'Workflow not found');
    const count = await this.prisma.sysWorkflowInstance.count({ where: { workflowId: id } });
    if (count > 0)
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_DELETE_HAS_INSTANCES,
        'Workflow has instances, disable instead',
      );
    return this.prisma.sysWorkflow.delete({ where: { id } });
  }

  async reorder(items: Array<{ id: string; sortOrder: number }>) {
    return this.prisma.$transaction(
      items.map((i) =>
        this.prisma.sysWorkflow.update({
          where: { id: i.id },
          data: { sortOrder: i.sortOrder },
        }),
      ),
    );
  }

  async findMatching(modelId: string, record: any) {
    const candidates = await this.prisma.sysWorkflow.findMany({
      where: { modelId, enabled: true, currentVersionId: { not: null } },
      orderBy: { sortOrder: 'asc' },
    });
    for (const wf of candidates) {
      if (this.matcher.match(wf.condition as ConditionExpression | null, record)) return wf;
    }
    return null;
  }

  private async findModel(appCode: string, modelCode: string) {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
    });
    if (!model)
      throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, 'Model not found');
    return model;
  }

  private async nextSortOrder(modelId: string): Promise<number> {
    const max = await this.prisma.sysWorkflow.aggregate({
      where: { modelId },
      _max: { sortOrder: true },
    });
    return (max._max.sortOrder ?? -1) + 1;
  }
}
