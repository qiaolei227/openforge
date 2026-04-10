import { Controller, Get, Post, Body } from '@nestjs/common';
import { SetupService } from './setup.service';
import { InitSystemDto } from './dto/init-system.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('setup')
export class SetupController {
  constructor(private setupService: SetupService) {}

  @Public()
  @Get('status')
  getStatus() {
    return this.setupService.getStatus();
  }

  @Public()
  @Post('init')
  initSystem(@Body() dto: InitSystemDto) {
    return this.setupService.initSystem(dto);
  }
}
