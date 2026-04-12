import { Module } from '@nestjs/common';
import { AppMgmtController } from './app-mgmt.controller';
import { AppMgmtService } from './app-mgmt.service';
import { AccessibleAppsService } from './accessible-apps.service';

@Module({
  controllers: [AppMgmtController],
  providers: [AppMgmtService, AccessibleAppsService],
  exports: [AppMgmtService, AccessibleAppsService],
})
export class AppMgmtModule {}
