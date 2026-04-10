import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { EntityController } from './entity.controller';
import { EntityService } from './entity.service';

@Module({
  imports: [ModelModule],
  controllers: [EntityController],
  providers: [EntityService],
  exports: [EntityService],
})
export class EntityModule {}
