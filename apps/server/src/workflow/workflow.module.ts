import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { WorkflowService } from './workflow.service';
import { WorkflowVersionService } from './workflow-version.service';
import { WorkflowConditionMatcher } from './workflow-condition-matcher.service';
import { AssigneeResolverService } from './assignee-resolver.service';
import { WorkflowLockHelper } from './workflow-lock.helper';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowCompletedListener } from './workflow-completed.listener';
import { WorkflowController } from './workflow.controller';

@Module({
  imports: [NotificationModule],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    WorkflowVersionService,
    WorkflowConditionMatcher,
    AssigneeResolverService,
    WorkflowLockHelper,
    WorkflowEngineService,
    WorkflowCompletedListener,
  ],
  exports: [
    WorkflowService,
    WorkflowVersionService,
    WorkflowConditionMatcher,
    AssigneeResolverService,
    WorkflowEngineService,
  ],
})
export class WorkflowModule {}
