import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { InboxService } from './inbox.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

class InboxQueryDto {
  @IsOptional()
  @IsUUID()
  appId?: string;

  @IsOptional()
  @IsUUID()
  orgId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

@Controller('inbox')
export class InboxController {
  constructor(@Inject(InboxService) private service: InboxService) {}

  @Get('pending')
  @RequirePermission('sys:self', 'view')
  pending(@Req() req: any, @Query() q: InboxQueryDto) {
    return this.service.pending(req.user.userId, q);
  }

  @Get('done')
  @RequirePermission('sys:self', 'view')
  done(@Req() req: any, @Query() q: InboxQueryDto) {
    return this.service.done(req.user.userId, q);
  }

  @Get('cc')
  @RequirePermission('sys:self', 'view')
  cc(@Req() req: any, @Query() q: InboxQueryDto) {
    return this.service.cc(req.user.userId, q);
  }

  @Get('my-instances')
  @RequirePermission('sys:self', 'view')
  myInstances(@Req() req: any, @Query() q: InboxQueryDto) {
    return this.service.myInstances(req.user.userId, q);
  }

  @Get('counts')
  @RequirePermission('sys:self', 'view')
  counts(@Req() req: any) {
    return this.service.counts(req.user.userId);
  }
}
