import { Module } from '@nestjs/common';
import { DynamicDataController } from './dynamic-data.controller';
import { UserListConfigController } from './user-list-config.controller';
import { DynamicDataService } from './dynamic-data.service';
import { QueryBuilderService } from './query-builder.service';
import { DeleteGuardService } from './delete-guard.service';
import { ChildrenService } from './children.service';
import { DataStatusService } from './data-status.service';
import { UserListConfigService } from './user-list-config.service';
import { LookupResolverService } from './lookup-resolver.service';
import { DistributedGuard } from './distributed.guard';
import { ModelModule } from '../model/model.module';
import { FileModule } from '../file/file.module';

@Module({
  imports: [ModelModule, FileModule],
  controllers: [DynamicDataController, UserListConfigController],
  providers: [DynamicDataService, QueryBuilderService, DeleteGuardService, ChildrenService, DataStatusService, UserListConfigService, LookupResolverService, DistributedGuard],
  exports: [ChildrenService, DynamicDataService, DataStatusService, LookupResolverService],
})
export class DynamicDataModule {}
