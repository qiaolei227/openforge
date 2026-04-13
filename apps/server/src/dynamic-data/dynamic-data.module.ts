import { Module } from '@nestjs/common';
import { DynamicDataController } from './dynamic-data.controller';
import { DynamicDataService } from './dynamic-data.service';
import { QueryBuilderService } from './query-builder.service';
import { DeleteGuardService } from './delete-guard.service';
import { ChildrenService } from './children.service';
import { DataStatusService } from './data-status.service';
import { ModelModule } from '../model/model.module';
import { FileModule } from '../file/file.module';

@Module({
  imports: [ModelModule, FileModule],
  controllers: [DynamicDataController],
  providers: [DynamicDataService, QueryBuilderService, DeleteGuardService, ChildrenService, DataStatusService],
  exports: [ChildrenService, DynamicDataService, DataStatusService],
})
export class DynamicDataModule {}
