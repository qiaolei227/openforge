import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @IsOptional()
  defaultValue?: any;

  @IsOptional()
  options?: any;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /** Value to backfill NULL rows when setting isRequired=true */
  @IsOptional()
  backfillValue?: any;
}
