import { IsString, IsObject, IsOptional } from 'class-validator';

export class UpdateViewDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  layout?: Record<string, any>;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
