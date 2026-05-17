import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationModule } from '../notification/notification.module';
import { ReadonlyPropagationService } from '../dynamic-data/readonly-propagation.service';
import { WorkflowService } from './workflow.service';
import { WorkflowVersionService } from './workflow-version.service';
import { WorkflowConditionMatcher } from './workflow-condition-matcher.service';
import { AssigneeResolverService } from './assignee-resolver.service';
import { WorkflowLockHelper } from './workflow-lock.helper';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowUrgeService } from './workflow-urge.service';
import { WorkflowCompletedListener } from './workflow-completed.listener';
import { WorkflowTimeoutProcessor } from './workflow-timeout.processor';
import { WorkflowController } from './workflow.controller';
import { WorkflowTaskController } from './workflow-task.controller';
import { WorkflowInstanceController } from './workflow-instance.controller';

@Module({
  imports: [
    NotificationModule,
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
    BullModule.registerQueue({ name: 'workflow-timeout' }),
  ],
  controllers: [WorkflowController, WorkflowTaskController, WorkflowInstanceController],
  providers: [
    WorkflowService,
    WorkflowVersionService,
    WorkflowConditionMatcher,
    AssigneeResolverService,
    WorkflowLockHelper,
    WorkflowEngineService,
    WorkflowUrgeService,
    WorkflowCompletedListener,
    WorkflowTimeoutProcessor,
    // P2.3 K2: propagate workflow-driven state changes (data_status, approved_*)
    // to distributed-model copies. Stateless service depending only on the
    // @Global() PrismaService, so registering a second instance here (in
    // addition to the one in DynamicDataModule) avoids a forwardRef cycle.
    ReadonlyPropagationService,
  ],
  exports: [
    WorkflowService,
    WorkflowVersionService,
    WorkflowConditionMatcher,
    AssigneeResolverService,
    WorkflowEngineService,
    WorkflowUrgeService,
  ],
})
export class WorkflowModule {}
