import { Controller, Get, Post, Put, Delete, Param, Body, Inject } from '@nestjs/common';
import { ActionService } from './action.service';
import { CreateActionDto, UpdateActionDto } from './dto/create-action.dto';
import { RequirePermission } from '../common/decorators/permission.decorator';

@Controller('models/:modelId/actions')
export class ActionController {
  constructor(@Inject(ActionService) private actionService: ActionService) {}

  @Get()
  @RequirePermission('designer:models', 'view')
  async list(@Param('modelId') modelId: string) {
    return this.actionService.findByModel(modelId);
  }

  @Post()
  @RequirePermission('designer:models', 'edit')
  async create(
    @Param('modelId') modelId: string,
    @Body() dto: CreateActionDto,
  ) {
    return this.actionService.create(modelId, dto);
  }

  @Put(':actionId')
  @RequirePermission('designer:models', 'edit')
  async update(
    @Param('actionId') actionId: string,
    @Body() dto: UpdateActionDto,
  ) {
    return this.actionService.update(actionId, dto);
  }

  @Delete(':actionId')
  @RequirePermission('designer:models', 'edit')
  async remove(@Param('actionId') actionId: string) {
    await this.actionService.delete(actionId);
    return { success: true };
  }
}
