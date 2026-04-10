import { Module } from '@nestjs/common';
import { ConfigParamController } from './config-param.controller';
import { ConfigParamService } from './config-param.service';

@Module({
  controllers: [ConfigParamController],
  providers: [ConfigParamService],
  exports: [ConfigParamService],
})
export class ConfigParamModule {}
