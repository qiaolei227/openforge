import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { SuggestFieldsDto, SmartFillDto } from './dto/suggest.dto';

@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('suggest-fields')
  suggestFields(@Body() dto: SuggestFieldsDto) {
    return this.aiService.suggestFields(dto.modelId);
  }

  @Post('smart-fill')
  smartFill(@Body() dto: SmartFillDto) {
    return this.aiService.smartFill(dto.fieldName, dto.modelId);
  }

  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.aiService.chat(
      dto.message,
      { appId: dto.appId, modelId: dto.modelId, page: 'unknown' },
    );
  }
}
