import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { DecideTaskDto } from './dto/decide-task.dto';
import { TransferTaskDto } from './dto/transfer-task.dto';
import { AddSignerTaskDto } from './dto/add-signer-task.dto';
import { ReturnTaskDto } from './dto/return-task.dto';

@Controller('workflow-tasks')
export class WorkflowTaskController {
  constructor(@Inject(WorkflowEngineService) private engine: WorkflowEngineService) {}

  @Post(':taskId/approve')
  @RequirePermission('sys:self', 'edit')
  approve(
    @Param('taskId', ParseUUIDPipe) id: string,
    @Body() dto: DecideTaskDto,
    @Req() req: any,
  ) {
    return this.engine.decide(
      id,
      'approve',
      { userId: req.user.userId, orgId: req.user.orgId },
      dto.comment,
    );
  }

  @Post(':taskId/reject')
  @RequirePermission('sys:self', 'edit')
  reject(
    @Param('taskId', ParseUUIDPipe) id: string,
    @Body() dto: DecideTaskDto,
    @Req() req: any,
  ) {
    return this.engine.decide(
      id,
      'reject',
      { userId: req.user.userId, orgId: req.user.orgId },
      dto.comment,
    );
  }

  @Post(':taskId/transfer')
  @RequirePermission('sys:self', 'edit')
  transfer(
    @Param('taskId', ParseUUIDPipe) id: string,
    @Body() dto: TransferTaskDto,
    @Req() req: any,
  ) {
    return this.engine.transfer(
      id,
      dto.newUserId,
      { userId: req.user.userId, orgId: req.user.orgId },
      dto.comment,
    );
  }

  @Post(':taskId/add-signer')
  @RequirePermission('sys:self', 'edit')
  addSigner(
    @Param('taskId', ParseUUIDPipe) id: string,
    @Body() dto: AddSignerTaskDto,
    @Req() req: any,
  ) {
    return this.engine.addSigner(
      id,
      dto.position,
      dto.newUserId,
      { userId: req.user.userId, orgId: req.user.orgId },
      dto.comment,
    );
  }

  @Post(':taskId/return')
  @RequirePermission('sys:self', 'edit')
  returnTask(
    @Param('taskId', ParseUUIDPipe) id: string,
    @Body() dto: ReturnTaskDto,
    @Req() req: any,
  ) {
    return this.engine.returnTask(
      id,
      dto.mode,
      { userId: req.user.userId, orgId: req.user.orgId },
      dto.comment,
    );
  }
}
