import { Module } from '@nestjs/common';
import { AppMgmtController } from './app-mgmt.controller';
import { AppMgmtService } from './app-mgmt.service';

@Module({
  controllers: [AppMgmtController],
  providers: [AppMgmtService],
  exports: [AppMgmtService],
})
export class AppMgmtModule {}
