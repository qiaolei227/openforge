import { Module } from '@nestjs/common';
import { ConfigParamModule } from '../config-param/config-param.module';
import { ActionModule } from '../action/action.module';
import { ModelController } from './model.controller';
import { ModelService } from './model.service';
import { FieldController } from './field.controller';
import { FieldService } from './field.service';
import { DdlManagerService } from './ddl-manager.service';
import { DistributionPolicyController } from './distribution-policy.controller';
import { DistributionPolicyService } from './distribution-policy.service';

@Module({
  imports: [ConfigParamModule, ActionModule],
  controllers: [ModelController, FieldController, DistributionPolicyController],
  providers: [ModelService, FieldService, DdlManagerService, DistributionPolicyService],
  exports: [ModelService, FieldService, DdlManagerService],
})
export class ModelModule {}
