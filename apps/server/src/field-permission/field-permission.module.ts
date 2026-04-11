import { Module } from '@nestjs/common';
import { FieldPermissionService } from './field-permission.service';
import { FieldPermissionController } from './field-permission.controller';

@Module({
  controllers: [FieldPermissionController],
  providers: [FieldPermissionService],
  exports: [FieldPermissionService],
})
export class FieldPermissionModule {}
