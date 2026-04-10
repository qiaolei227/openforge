import { IsString, IsOptional, IsInt } from 'class-validator';

export class UpdateDictItemDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  labelEn?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
