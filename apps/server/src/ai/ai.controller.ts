import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { SuggestFieldsDto, SmartFillDto } from './dto/suggest.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('suggest-fields')
  @RequirePermission('sys:self', 'view')
  suggestFields(@Body() dto: SuggestFieldsDto) {
    return this.aiService.suggestFields(dto.modelId);
  }

  @Post('smart-fill')
  @RequirePermission('sys:self', 'view')
  smartFill(@Body() dto: SmartFillDto) {
    return this.aiService.smartFill(dto.fieldName, dto.modelId);
  }

  @Post('chat')
  @RequirePermission('sys:self', 'view')
  chat(@Body() dto: ChatDto) {
    return this.aiService.chat(
      dto.message,
      { appId: dto.appId, modelId: dto.modelId, page: 'unknown' },
    );
  }
}
