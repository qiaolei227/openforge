import { Injectable } from '@nestjs/common';
import { ChatMessage } from '../llm-provider.service';

export interface FieldSuggestion {
  name: string;
  columnName: string;
  fieldType: string;
  isRequired: boolean;
  isUnique: boolean;
  semantic?: string;
}

export interface FieldSuggestOutput {
  fields: FieldSuggestion[];
}

@Injectable()
export class FieldSuggestSkill {
  buildPrompt(
    modelName: string,
    modelDescription: string | null,
    existingFields: string[],
    systemPrompt: string,
  ): ChatMessage[] {
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `请为模型「${modelName}」${modelDescription ? `（${modelDescription}）` : ''}建议合适的字段。

已有字段：${existingFields.length > 0 ? existingFields.join(', ') : '暂无'}

请输出 JSON 格式：
{
  "fields": [
    { "name": "显示名", "columnName": "column_name", "fieldType": "STRING", "isRequired": true, "isUnique": false, "semantic": "业务含义" }
  ]
}

只输出 JSON。建议 5-8 个常用字段，不要重复已有字段。`,
      },
    ];
  }

  validate(output: any): FieldSuggestOutput | null {
    if (!output?.fields || !Array.isArray(output.fields)) return null;
    const validTypes = [
      'STRING',
      'TEXT',
      'INTEGER',
      'DECIMAL',
      'BOOLEAN',
      'DATE',
      'DATETIME',
      'TIME',
      'ENUM',
      'MULTI_ENUM',
      'AUTO_NUMBER',
      'REFERENCE',
    ];
    const validFields = output.fields.filter(
      (f: any) =>
        f.name &&
        f.columnName &&
        f.fieldType &&
        /^[a-z][a-z0-9_]*$/.test(f.columnName) &&
        validTypes.includes(f.fieldType),
    );
    return { fields: validFields };
  }
}
