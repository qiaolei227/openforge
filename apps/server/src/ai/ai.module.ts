import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmProviderService } from './llm-provider.service';
import { ContextBuilderService } from './context-builder.service';
import { FieldSuggestSkill } from './skills/field-suggest.skill';

@Module({
  controllers: [AiController],
  providers: [AiService, LlmProviderService, ContextBuilderService, FieldSuggestSkill],
  exports: [AiService],
})
export class AiModule {}
