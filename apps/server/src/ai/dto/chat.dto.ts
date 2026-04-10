import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  modelId?: string;
}
