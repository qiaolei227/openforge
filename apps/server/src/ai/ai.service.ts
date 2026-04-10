import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmProviderService } from './llm-provider.service';
import { ContextBuilderService, AiContext } from './context-builder.service';
import { FieldSuggestSkill, FieldSuggestOutput } from './skills/field-suggest.skill';

export interface SmartFillResult {
  columnName: string;
  fieldType: string;
  isRequired: boolean;
  isUnique: boolean;
  semantic?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private llm: LlmProviderService,
    private contextBuilder: ContextBuilderService,
    private fieldSuggestSkill: FieldSuggestSkill,
  ) {}

  /** Suggest fields for a model based on its name, description, and existing fields */
  async suggestFields(
    modelId: string,
  ): Promise<{ success: boolean; data?: FieldSuggestOutput; error?: string }> {
    try {
      const model = await this.prisma.sysModel.findFirst({
        where: { id: modelId },
        include: {
          fields: {
            where: { deletedAt: null, isSystem: false },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!model) {
        return { success: false, error: 'MODEL_NOT_FOUND' };
      }

      const ctx: AiContext = { page: 'model-detail', modelId, appId: model.appId };
      const systemPrompt = await this.contextBuilder.buildSystemPrompt(ctx);

      const existingFields = model.fields.map((f) => f.name);
      const messages = this.fieldSuggestSkill.buildPrompt(
        model.name,
        model.description,
        existingFields,
        systemPrompt.content,
      );

      const raw = await this.llm.generateJSON<any>(messages);
      const validated = this.fieldSuggestSkill.validate(raw);

      if (!validated || validated.fields.length === 0) {
        this.logger.warn('AI returned invalid field suggestions, raw output: %j', raw);
        return { success: false, error: 'AI_INVALID_RESPONSE' };
      }

      return { success: true, data: validated };
    } catch (error) {
      this.logger.error('suggestFields failed: %s', (error as Error).message);
      return {
        success: false,
        error: 'AI_SERVICE_UNAVAILABLE',
      };
    }
  }

  /** Smart-fill a single field: generate columnName, fieldType, semantic from a display name */
  async smartFill(
    fieldName: string,
    modelId?: string,
  ): Promise<{ success: boolean; data?: SmartFillResult; error?: string }> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: `你是 OpenForge 平台的 AI 建模助手。根据字段显示名推断最佳的列名、字段类型和业务含义。

支持的字段类型：STRING, TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME, TIME, ENUM, MULTI_ENUM, AUTO_NUMBER, REFERENCE

列名规范：小写字母开头，仅允许小写字母、数字、下划线。

输出 JSON 格式：
{ "columnName": "xxx", "fieldType": "STRING", "isRequired": false, "isUnique": false, "semantic": "业务含义" }

只输出 JSON。`,
        },
        {
          role: 'user' as const,
          content: `字段名称：「${fieldName}」\n请推断合适的列名和字段类型。只输出 JSON。`,
        },
      ];

      const raw = await this.llm.generateJSON<SmartFillResult>(messages);

      if (!raw?.columnName || !raw?.fieldType) {
        return { success: false, error: 'AI_INVALID_RESPONSE' };
      }

      // Validate columnName format
      if (!/^[a-z][a-z0-9_]*$/.test(raw.columnName)) {
        return { success: false, error: 'AI_INVALID_RESPONSE' };
      }

      return { success: true, data: raw };
    } catch (error) {
      this.logger.error('smartFill failed: %s', (error as Error).message);
      return {
        success: false,
        error: 'AI_SERVICE_UNAVAILABLE',
      };
    }
  }

  /** Basic non-streaming chat (P1.2 only returns full response; SSE streaming deferred to P3) */
  async chat(
    message: string,
    context: AiContext,
  ): Promise<{ success: boolean; reply?: string; error?: string }> {
    try {
      const systemPrompt = await this.contextBuilder.buildSystemPrompt(context);
      const messages = [
        systemPrompt,
        { role: 'user' as const, content: message },
      ];

      const reply = await this.llm.chatSync(messages);
      return { success: true, reply };
    } catch (error) {
      this.logger.error('chat failed: %s', (error as Error).message);
      return {
        success: false,
        error: 'AI_SERVICE_UNAVAILABLE',
      };
    }
  }
}
