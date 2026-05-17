import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowVersionService } from './workflow-version.service';
import { WorkflowConditionMatcher } from './workflow-condition-matcher.service';
import { AssigneeResolverService } from './assignee-resolver.service';
import { WorkflowController } from './workflow.controller';

@Module({
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    WorkflowVersionService,
    WorkflowConditionMatcher,
    AssigneeResolverService,
  ],
  exports: [
    WorkflowService,
    WorkflowVersionService,
    WorkflowConditionMatcher,
    AssigneeResolverService,
  ],
})
export class WorkflowModule {}
