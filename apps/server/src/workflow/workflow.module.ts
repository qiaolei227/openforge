import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowVersionService } from './workflow-version.service';
import { WorkflowConditionMatcher } from './workflow-condition-matcher.service';
import { WorkflowController } from './workflow.controller';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowVersionService, WorkflowConditionMatcher],
  exports: [WorkflowService, WorkflowVersionService, WorkflowConditionMatcher],
})
export class WorkflowModule {}
