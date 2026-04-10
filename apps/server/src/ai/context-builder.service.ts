import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessage } from './llm-provider.service';

export interface AiContext {
  page: string;
  appId?: string;
  modelId?: string;
}

@Injectable()
export class ContextBuilderService {
  constructor(private prisma: PrismaService) {}

  async buildSystemPrompt(ctx: AiContext): Promise<ChatMessage> {
    const parts: string[] = [this.getTier1()];
    if (ctx.modelId) parts.push(await this.getTier2(ctx.modelId));
    if (ctx.appId) parts.push(await this.getTier3(ctx.appId, ctx.modelId));
    return { role: 'system', content: parts.join('\n\n') };
  }

  /** Tier 1: Platform-level knowledge, always included */
  private getTier1(): string {
    return `你是 OpenForge 平台的 AI 建模助手。你帮助用户创建和管理数据模型。

支持的字段类型：STRING, TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME, TIME, ENUM, MULTI_ENUM, AUTO_NUMBER, REFERENCE, MULTI_REFERENCE

命名规范：
- 列名(columnName): 小写字母开头，仅允许小写字母、数字、下划线
- 表名(tableName): 同上

当用户要求建议字段时，输出 JSON 格式。`;
  }

  /** Tier 2: Current model context */
  private async getTier2(modelId: string): Promise<string> {
    const model = await this.prisma.sysModel.findUnique({
      where: { id: modelId },
      include: {
        fields: {
          where: { deletedAt: null, isSystem: false },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!model) return '';
    const fieldList = model.fields
      .map(
        (f) =>
          `- ${f.name} (${f.columnName}): ${f.fieldType}${f.isRequired ? ' [必填]' : ''}${f.isUnique ? ' [唯一]' : ''}`,
      )
      .join('\n');
    return `当前模型：${model.name} (${model.tableName})\n已有字段：\n${fieldList || '（暂无）'}`;
  }

  /** Tier 3: Sibling models in the same app */
  private async getTier3(
    appId: string,
    excludeModelId?: string,
  ): Promise<string> {
    const models = await this.prisma.sysModel.findMany({
      where: {
        appId,
        ...(excludeModelId ? { id: { not: excludeModelId } } : {}),
      },
      include: {
        fields: { where: { deletedAt: null, isSystem: false }, take: 5 },
      },
    });
    if (models.length === 0) return '';
    const list = models
      .map(
        (m) =>
          `- ${m.name} (${m.tableName}): ${m.fields.map((f) => f.name).join(', ')}`,
      )
      .join('\n');
    return `同应用其他模型：\n${list}`;
  }
}
