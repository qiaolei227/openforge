import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { ModelCreatedEvent } from '../event-bus/events';

const BASE_SYSTEM_ACTIONS = [
  { code: 'create',    name: '新建',     icon: 'plus',            sortOrder: 0 },
  { code: 'edit',      name: '编辑',     icon: 'pencil',          sortOrder: 1 },
  { code: 'delete',    name: '删除',     icon: 'trash-2',         sortOrder: 8 },
  { code: 'archive',   name: '归档',     icon: 'archive',         sortOrder: 7 },
  { code: 'unarchive', name: '取消归档', icon: 'archive-restore', sortOrder: 7 },
];

const DATA_STATUS_ACTIONS = [
  { code: 'submit',    name: '提交',     icon: 'send',         sortOrder: 2, visibility: { dataStatus: ['draft'] } },
  { code: 'approve',   name: '审核',     icon: 'check-circle', sortOrder: 3, visibility: { dataStatus: ['submitted'] } },
  { code: 'reject',    name: '驳回',     icon: 'x-circle',     sortOrder: 4, visibility: { dataStatus: ['submitted'] } },
  { code: 'withdraw',  name: '撤回',     icon: 'undo-2',       sortOrder: 5, visibility: { dataStatus: ['submitted'] } },
  { code: 'unapprove', name: '反审核',   icon: 'rotate-ccw',   sortOrder: 6, visibility: { dataStatus: ['approved'] } },
  { code: 'revise',    name: '重新编辑', icon: 'file-edit',    sortOrder: 6, visibility: { dataStatus: ['pending_revision'] } },
];

@Injectable()
export class ActionService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  @OnEvent('model.created')
  async handleModelCreated(event: ModelCreatedEvent): Promise<void> {
    await this.generateSystemActions(event.data.id);
  }

  async generateSystemActions(modelId: string): Promise<void> {
    const model = await this.prisma.sysModel.findUnique({ where: { id: modelId } });
    if (!model) throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, 'Model not found');

    const actions = [...BASE_SYSTEM_ACTIONS];
    if (model.enableDataStatus) {
      actions.push(...DATA_STATUS_ACTIONS);
    }

    await this.prisma.sysAction.createMany({
      data: actions.map((a) => ({
        modelId,
        code: a.code,
        name: a.name,
        icon: a.icon,
        category: 'system',
        actionType: 'builtin',
        displayType: 'button',
        position: 'both',
        sortOrder: a.sortOrder,
        visibility: (a as any).visibility || null,
      })),
      skipDuplicates: true,
    });
  }

  async syncDataStatusActions(modelId: string, enableDataStatus: boolean): Promise<void> {
    if (enableDataStatus) {
      await this.prisma.sysAction.createMany({
        data: DATA_STATUS_ACTIONS.map((a) => ({
          modelId,
          code: a.code,
          name: a.name,
          icon: a.icon,
          category: 'system',
          actionType: 'builtin',
          displayType: 'button',
          position: 'both',
          sortOrder: a.sortOrder,
          visibility: a.visibility,
        })),
        skipDuplicates: true,
      });
    } else {
      const codes = DATA_STATUS_ACTIONS.map((a) => a.code);
      await this.prisma.sysAction.deleteMany({
        where: { modelId, code: { in: codes }, category: 'system' },
      });
    }
  }

  async findByModel(modelId: string) {
    return this.prisma.sysAction.findMany({
      where: { modelId, parentId: null },
      include: { children: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(modelId: string, dto: import('./dto/create-action.dto').CreateActionDto) {
    return this.prisma.sysAction.create({
      data: {
        modelId,
        code: dto.code,
        name: dto.name,
        icon: dto.icon,
        parentId: dto.parentId,
        category: 'custom',
        actionType: dto.actionType,
        displayType: dto.displayType || 'button',
        position: dto.position || 'both',
        sortOrder: dto.sortOrder || 0,
        config: dto.config,
        visibility: dto.visibility,
      },
    });
  }

  async update(id: string, dto: import('./dto/create-action.dto').UpdateActionDto) {
    const action = await this.prisma.sysAction.findUnique({ where: { id } });
    if (!action) throw new BusinessException(404, ErrorCodes.ACTION_NOT_FOUND, 'Action not found');

    const data = action.category === 'system'
      ? { name: dto.name, icon: dto.icon, sortOrder: dto.sortOrder, visibility: dto.visibility }
      : dto;

    return this.prisma.sysAction.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    const action = await this.prisma.sysAction.findUnique({ where: { id } });
    if (!action) throw new BusinessException(404, ErrorCodes.ACTION_NOT_FOUND, 'Action not found');
    if (action.category === 'system') {
      throw new BusinessException(400, ErrorCodes.ACTION_SYSTEM_NOT_DELETABLE, 'System actions cannot be deleted');
    }
    await this.prisma.sysAction.delete({ where: { id } });
  }
}
