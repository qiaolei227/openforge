import { Module } from '@nestjs/common';
import { DesignerDataController } from './designer-data.controller';
import { DynamicDataModule } from '../dynamic-data/dynamic-data.module';

@Module({
  imports: [DynamicDataModule],
  controllers: [DesignerDataController],
})
export class DesignerDataModule {}
