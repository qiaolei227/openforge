import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SuggestFieldsDto {
  @IsString()
  @IsNotEmpty()
  modelId!: string;
}

export class SmartFillDto {
  @IsString()
  @IsNotEmpty()
  fieldName!: string;

  @IsOptional()
  @IsString()
  modelId?: string;
}
