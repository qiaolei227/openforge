import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { WorkflowDefinition } from './types';
import { validateWorkflowDefinition } from './workflow-definition-validator';

@Injectable()
export class WorkflowVersionService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async publish(workflowId: string, definition: WorkflowDefinition, userId: string) {
    validateWorkflowDefinition(definition);
    const wf = await this.prisma.sysWorkflow.findUnique({ where: { id: workflowId } });
    if (!wf)
      throw new BusinessException(404, ErrorCodes.WORKFLOW_NOT_FOUND, 'Workflow not found');

    const max = await this.prisma.sysWorkflowVersion.aggregate({
      where: { workflowId },
      _max: { versionNo: true },
    });
    const nextNo = (max._max.versionNo ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.sysWorkflowVersion.create({
        data: {
          workflowId,
          versionNo: nextNo,
          definition: definition as any,
          publishedBy: userId,
        },
      });
      await tx.sysWorkflow.update({
        where: { id: workflowId },
        data: { currentVersionId: version.id },
      });
      return version;
    });
  }

  async activate(workflowId: string, versionId: string) {
    const v = await this.prisma.sysWorkflowVersion.findFirst({
      where: { id: versionId, workflowId },
    });
    if (!v)
      throw new BusinessException(
        404,
        ErrorCodes.WORKFLOW_VERSION_NOT_FOUND,
        'Workflow version not found',
      );
    return this.prisma.sysWorkflow.update({
      where: { id: workflowId },
      data: { currentVersionId: versionId },
    });
  }

  async listVersions(workflowId: string) {
    return this.prisma.sysWorkflowVersion.findMany({
      where: { workflowId },
      orderBy: { versionNo: 'desc' },
    });
  }
}
