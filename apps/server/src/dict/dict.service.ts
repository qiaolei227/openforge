import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { CreateDictDto } from './dto/create-dict.dto';
import { UpdateDictDto } from './dto/update-dict.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';

@Injectable()
export class DictService {
  constructor(private prisma: PrismaService) {}

  /** List dicts for an app, with item count */
  async findByAppId(appId: string) {
    return this.prisma.sysDict.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { items: true } },
      },
    });
  }

  /** Get dict by id with items */
  async findById(id: string) {
    const dict = await this.prisma.sysDict.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!dict) {
      throw new BusinessException(
        404,
        ErrorCodes.DICT_NOT_FOUND,
        `Dict '${id}' not found`,
      );
    }
    return dict;
  }

  /** Get dict by app + code with items */
  async findByCode(appId: string, code: string) {
    const dict = await this.prisma.sysDict.findUnique({
      where: { appId_code: { appId, code } },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!dict) {
      throw new BusinessException(
        404,
        ErrorCodes.DICT_NOT_FOUND,
        `Dict with code '${code}' not found in app '${appId}'`,
      );
    }
    return dict;
  }

  /** Create a dict (optionally with initial items) */
  async create(appId: string, dto: CreateDictDto) {
    // Validate app exists
    const app = await this.prisma.sysApp.findUnique({ where: { id: appId } });
    if (!app) {
      throw new BusinessException(
        404,
        ErrorCodes.APP_NOT_FOUND,
        `App '${appId}' not found`,
      );
    }

    // Check code uniqueness within app
    const existing = await this.prisma.sysDict.findUnique({
      where: { appId_code: { appId, code: dto.code } },
    });
    if (existing) {
      throw new BusinessException(
        409,
        ErrorCodes.DICT_CODE_DUPLICATE,
        `Dict code '${dto.code}' already exists in app '${app.name}'`,
      );
    }

    return this.prisma.sysDict.create({
      data: {
        appId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        ...(dto.items?.length && {
          items: {
            createMany: {
              data: dto.items.map((item, idx) => ({
                value: item.value,
                label: item.label,
                labelEn: item.labelEn,
                color: item.color,
                sortOrder: item.sortOrder ?? idx,
              })),
            },
          },
        }),
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  /** Update dict name/description */
  async update(id: string, dto: UpdateDictDto) {
    await this.findById(id);
    return this.prisma.sysDict.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  /** Delete dict — checks for field references first */
  async delete(id: string) {
    const dict = await this.findById(id);

    // Check if any ENUM/MULTI_ENUM field references this dict's code within the same app
    const ref = await this.prisma.sysField.findFirst({
      where: {
        fieldType: { in: ['ENUM', 'MULTI_ENUM'] },
        deletedAt: null,
        options: { path: ['dictCode'], equals: dict.code },
        model: { appId: dict.appId },
      },
    });
    if (ref) {
      throw new BusinessException(
        409,
        ErrorCodes.DICT_IN_USE,
        `Dict '${dict.name}' is referenced by field '${ref.name}'`,
      );
    }

    // Cascade deletes items via Prisma onDelete: Cascade
    await this.prisma.sysDict.delete({ where: { id } });
  }

  /** Create a single item in a dict */
  async createItem(dictId: string, dto: CreateDictItemDto) {
    // Validate dict exists
    await this.findById(dictId);

    // Check value uniqueness within dict
    const existing = await this.prisma.sysDictItem.findUnique({
      where: { dictId_value: { dictId, value: dto.value } },
    });
    if (existing) {
      throw new BusinessException(
        409,
        ErrorCodes.DICT_ITEM_VALUE_DUPLICATE,
        `Dict item value '${dto.value}' already exists`,
      );
    }

    return this.prisma.sysDictItem.create({
      data: {
        dictId,
        value: dto.value,
        label: dto.label,
        labelEn: dto.labelEn,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  /** Update an item */
  async updateItem(id: string, dto: UpdateDictItemDto) {
    const item = await this.prisma.sysDictItem.findUnique({ where: { id } });
    if (!item) {
      throw new BusinessException(
        404,
        ErrorCodes.DICT_ITEM_NOT_FOUND,
        `Dict item '${id}' not found`,
      );
    }

    return this.prisma.sysDictItem.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.labelEn !== undefined && { labelEn: dto.labelEn }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  /** Delete an item */
  async deleteItem(id: string) {
    const item = await this.prisma.sysDictItem.findUnique({ where: { id } });
    if (!item) {
      throw new BusinessException(
        404,
        ErrorCodes.DICT_ITEM_NOT_FOUND,
        `Dict item '${id}' not found`,
      );
    }

    await this.prisma.sysDictItem.delete({ where: { id } });
  }

  /** Batch update sort order for items */
  async sortItems(dictId: string, items: Array<{ id: string; sortOrder: number }>) {
    await this.findById(dictId);

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.sysDictItem.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }
}
