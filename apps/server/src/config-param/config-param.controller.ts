import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ConfigParamService } from './config-param.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('config')
export class ConfigParamController {
  constructor(private configParamService: ConfigParamService) {}

  @Get()
  @RequirePermission('sys:config', 'view')
  findAll() {
    return this.configParamService.findAll();
  }

  @Get(':code')
  @RequirePermission('sys:config', 'view')
  findByCode(@Param('code') code: string) {
    return this.configParamService.findByCode(code);
  }

  @Patch(':code')
  @RequirePermission('sys:config', 'edit')
  update(@Param('code') code: string, @Body() dto: UpdateConfigDto) {
    return this.configParamService.update(code, dto.value);
  }
}
