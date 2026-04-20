import { IsString, IsOptional, IsArray, ValidateNested, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

class SortItemDto {
  @IsString()
  field!: string;

  @IsIn(['asc', 'desc'])
  order!: 'asc' | 'desc';
}

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SortItemDto)
  defaultSort?: SortItemDto[] | null;

  @IsOptional()
  @IsBoolean()
  autoDistribute?: boolean;
}
