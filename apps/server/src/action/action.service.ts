import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { ModelCreatedEvent } from '../event-bus/events';

const BASE_SYSTEM_ACTIONS = [
  { code: 'create',    name: '新建',     icon: 'plus',            sortOrder: 0, displayType: 'button', position: 'both' },
  { code: 'delete',    name: '删除',     icon: 'trash-2',         sortOrder: 8, displayType: 'button', position: 'both' },
  { code: 'archive',   name: '归档',     icon: 'archive',         sortOrder: 7, displayType: 'split',  position: 'both' },
  { code: 'unarchive', name: '取消归档', icon: 'archive-restore', sortOrder: 7, displayType: 'button', position: 'both' },
];

const DATA_STATUS_ACTIONS = [
  { code: 'submit',    name: '提交',   icon: 'send',         sortOrder: 2, displayType: 'split',  position: 'both' },
  { code: 'withdraw',  name: '撤销',   icon: 'undo-2',       sortOrder: 3, displayType: 'button', position: 'both' },
  { code: 'approve',   name: '审核',   icon: 'check-circle', sortOrder: 4, displayType: 'split',  position: 'both' },
  { code: 'unapprove', name: '反审核', icon: 'rotate-ccw',   sortOrder: 5, displayType: 'button', position: 'both' },
];

@Injectable()
export class ActionService implements OnApplicationBootstrap {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /** Clean up deprecated "list" system actions from existing models */
  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.sysAction.deleteMany({
      where: { code: 'list', category: 'system' },
    });
  }

  @OnEvent('model.created')
  async handleModelCreated(event: ModelCreatedEvent): Promise<void> {
    await this.generateSystemActions(event.data.id);
  }

  async generateSystemActions(modelId: string): Promise<void> {
    const model = await this.prisma.sysModel.findUnique({ where: { id: modelId } });
    if (!model) throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, 'Model not found');

    const allActions = [...BASE_SYSTEM_ACTIONS];
    if (model.enableDataStatus) {
      allActions.push(...DATA_STATUS_ACTIONS);
    }

    // Child actions that will be linked to their parents
    const childCodes = ['unarchive', 'withdraw', 'unapprove'];
    const topLevel = allActions.filter((a) => !childCodes.includes(a.code));

    await this.prisma.sysAction.createMany({
      data: topLevel.map((a) => ({
        modelId,
        code: a.code,
        name: a.name,
        icon: a.icon,
        category: 'system',
        actionType: 'builtin',
        displayType: a.displayType || 'button',
        position: (a as any).position || 'both',
        sortOrder: a.sortOrder,
      })),
      skipDuplicates: true,
    });

    // Link child actions to their parent split buttons
    const parentChildPairs: Array<{ parentCode: string; child: typeof allActions[0] }> = [
      { parentCode: 'archive', child: allActions.find((a) => a.code === 'unarchive')! },
    ];
    if (model.enableDataStatus) {
      parentChildPairs.push(
        { parentCode: 'submit', child: allActions.find((a) => a.code === 'withdraw')! },
        { parentCode: 'approve', child: allActions.find((a) => a.code === 'unapprove')! },
      );
    }

    for (const { parentCode, child } of parentChildPairs) {
      if (!child) continue;
      const parent = await this.prisma.sysAction.findFirst({
        where: { modelId, code: parentCode },
      });
      if (!parent) continue;
      await this.prisma.sysAction.upsert({
        where: { modelId_code: { modelId, code: child.code } },
        create: {
          modelId,
          code: child.code,
          name: child.name,
          icon: child.icon,
          category: 'system',
          actionType: 'builtin',
          displayType: 'button',
          position: 'both',
          sortOrder: child.sortOrder,
          parentId: parent.id,
        },
        update: { parentId: parent.id },
      });
    }
  }

  async syncDataStatusActions(modelId: string, enableDataStatus: boolean): Promise<void> {
    if (enableDataStatus) {
      // Upsert top-level split parents (submit, approve)
      const topLevel = DATA_STATUS_ACTIONS.filter((a) => !['withdraw', 'unapprove'].includes(a.code));
      for (const a of topLevel) {
        await this.prisma.sysAction.upsert({
          where: { modelId_code: { modelId, code: a.code } },
          create: {
            modelId,
            code: a.code,
            name: a.name,
            icon: a.icon,
            category: 'system',
            actionType: 'builtin',
            displayType: a.displayType,
            position: 'both',
            sortOrder: a.sortOrder,
          },
          update: {},
        });
      }

      // Link child actions to their parents
      const pairs: Array<{ parentCode: string; childCode: string }> = [
        { parentCode: 'submit', childCode: 'withdraw' },
        { parentCode: 'approve', childCode: 'unapprove' },
      ];
      for (const { parentCode, childCode } of pairs) {
        const parent = await this.prisma.sysAction.findFirst({
          where: { modelId, code: parentCode },
        });
        const child = DATA_STATUS_ACTIONS.find((a) => a.code === childCode)!;
        if (!parent || !child) continue;
        await this.prisma.sysAction.upsert({
          where: { modelId_code: { modelId, code: childCode } },
          create: {
            modelId,
            code: child.code,
            name: child.name,
            icon: child.icon,
            category: 'system',
            actionType: 'builtin',
            displayType: 'button',
            position: 'both',
            sortOrder: child.sortOrder,
            parentId: parent.id,
          },
          update: { parentId: parent.id },
        });
      }
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
    // Default sortOrder: append to the end of siblings
    let sortOrder = dto.sortOrder;
    if (sortOrder == null) {
      const maxRow = await this.prisma.sysAction.aggregate({
        where: { modelId, parentId: dto.parentId ?? null },
        _max: { sortOrder: true },
      });
      sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
    }

    return this.prisma.sysAction.create({
      data: {
        modelId,
        code: dto.code,
        name: dto.name,
        icon: dto.icon,
        parentId: dto.parentId,
        category: 'custom',
        actionType: dto.actionType || 'builtin',
        displayType: dto.displayType || 'button',
        position: dto.position || 'both',
        sortOrder,
        config: dto.config,
      },
    });
  }

  async update(id: string, dto: import('./dto/create-action.dto').UpdateActionDto) {
    const action = await this.prisma.sysAction.findUnique({ where: { id } });
    if (!action) throw new BusinessException(404, ErrorCodes.ACTION_NOT_FOUND, 'Action not found');

    const data = action.category === 'system'
      ? { name: dto.name, icon: dto.icon, sortOrder: dto.sortOrder }
      : dto;

    return this.prisma.sysAction.update({ where: { id }, data });
  }

  async batchSort(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.sysAction.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
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
