import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ConfigParamService } from './config-param.service';
import { UpdateConfigDto } from './dto/update-config.dto';

@Controller('config')
export class ConfigParamController {
  constructor(private configParamService: ConfigParamService) {}

  @Get()
  findAll() {
    return this.configParamService.findAll();
  }

  @Get(':code')
  findByCode(@Param('code') code: string) {
    return this.configParamService.findByCode(code);
  }

  @Patch(':code')
  update(@Param('code') code: string, @Body() dto: UpdateConfigDto) {
    return this.configParamService.update(code, dto.value);
  }
}
